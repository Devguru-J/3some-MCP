#!/usr/bin/env bash
# 3some-collab 실시간 깨우기 Monitor (읽기 전용 폴링).
#
# Claude Code 의 Monitor 도구로 띄워서 /listen 루프의 "주 깨우기 신호"로 쓴다.
# 허브 GET /api/messages 를 짧은 간격으로 읽어, 직전에 본 최대 메시지 id 보다 큰
# + 본인(AGENT_ID)이 쓴 게 아닌 새 메시지가 있으면 한 줄씩 stdout 으로 내보낸다
# (= 세션을 즉시 깨움). 이러면 ScheduleWakeup 의 60초 floor 를 우회해 ~수초 실시간.
#
# 핵심: 읽음 커서를 advance 시키는 /inbox 가 아니라 읽기 전용 /api/messages 를 쓰므로
# 메시지를 "소비"하지 않는다 → 깨어난 세션이 read_messages 로 정상 수신 가능.
#
# 필요한 env (inbox-hook.sh 와 동일 계약 — 시크릿은 git 에 안 올라감):
#   COLLAB_URL    기본값 http://192.168.45.169:8787 (LAN). IP 바뀌면 export.
#   COLLAB_TOKEN  공유 팀 토큰 (필수)
#   AGENT_ID      본인 핸들 (필수) — 자기 발화로는 안 깨우기 위해 사용
#
# 상태 파일: tmp/.collab_lastid (프로젝트 루트 기준). 시작 시점 최대 id 로 시드해
# 과거 메시지로는 안 깨운다.
set -uo pipefail

HUB="${COLLAB_URL:-http://192.168.45.169:8787}"
TOK="${COLLAB_TOKEN:?COLLAB_TOKEN 미설정}"
ME="${AGENT_ID:?AGENT_ID 미설정}"
POLL="${COLLAB_POLL_SEC:-3}"
STATE="tmp/.collab_lastid"

mkdir -p tmp

# 시작 시점의 최대 id 로 시드 — 이미 쌓인 옛 메시지로는 안 깨움.
# (curl 을 node 로 직접 파이프: 셸 변수 경유 시 본문이 깨져 0 으로 시드되는 버그 회피)
if [ ! -f "$STATE" ]; then
  curl -fsS --max-time 5 -H "X-Auth-Token: $TOK" "$HUB/api/messages" 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let m=0;try{m=Math.max(0,...(JSON.parse(s).messages||[]).map(x=>x.id||0))}catch(e){}process.stdout.write(String(m))})' > "$STATE" 2>/dev/null
  [ -s "$STATE" ] || echo 0 > "$STATE"
fi

while true; do
  curl -fsS --max-time 5 -H "X-Auth-Token: $TOK" "$HUB/api/messages" 2>/dev/null \
    | node -e '
      let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        const fs=require("fs");
        const ME=process.argv[1], STATE=process.argv[2];
        let last=0; try{last=parseInt(fs.readFileSync(STATE,"utf8").trim()||"0",10)||0}catch(e){}
        let msgs=[]; try{msgs=JSON.parse(s).messages||[]}catch(e){return}
        let max=last;
        const fresh=[];
        for(const m of msgs){
          const id=m.id||0; if(id>max)max=id;
          if(id>last && m.from_agent!==ME){
            const r=String(m.recipient||"");
            // 채널(#...) 또는 나에게 온 DM 만 깨움
            if(r.startsWith("#")||r===ME||r==="@"+ME){
              fresh.push(`[${r}] ${m.from_agent}: ${String(m.body||"").replace(/\s+/g," ").slice(0,160)}`);
            }
          }
        }
        if(max>last){try{fs.writeFileSync(STATE,String(max))}catch(e){}}
        for(const line of fresh) process.stdout.write(line+"\n");
      });
    ' "$ME" "$STATE"
  sleep "$POLL"
done
