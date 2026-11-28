import { shuffleArray } from '../utils/random.js';

export function buildBaseballInitState(pIds, maxInnings, rng = Math.random) {
  const shuffled = shuffleArray(pIds, rng);
  const teamA = [];
  const teamB = [];
  shuffled.forEach((pid, idx) => (idx % 2 === 0 ? teamA : teamB).push(pid));
  if (teamB.length === 0 && teamA.length > 0) teamB.push(teamA[0]);
  return {
    maxInnings: maxInnings || 3,
    teamA,
    teamB,
    batterIdxA: 0,
    batterIdxB: 0,
    pitcherIdxA: 0,
    pitcherIdxB: 0,
    inning: 1,
    half: 'top',
    scoresA: [0],
    scoresB: [],
    balls: 0,
    strikes: 0,
    outs: 0,
    bases: [false, false, false],
    pending: {},
    seq: 0,
    lastPlay: '경기 시작! 투수와 타자가 코스를 선택하세요.',
    logs: ['⚾ 종이야구 술자리 팀전 시작!'],
    winnerTeam: null,
    loserId: null
  };
}

export function getBaseballRoles(st) {
  const attTeam = st.half === 'top' ? st.teamA || [] : st.teamB || [];
  const defTeam = st.half === 'top' ? st.teamB || [] : st.teamA || [];
  const bIdx = st.half === 'top' ? st.batterIdxA || 0 : st.batterIdxB || 0;
  const pIdx = st.half === 'top' ? st.pitcherIdxB || 0 : st.pitcherIdxA || 0;
  return {
    batterId: attTeam[bIdx % Math.max(1, attTeam.length)],
    pitcherId: defTeam[pIdx % Math.max(1, defTeam.length)]
  };
}

function sumScores(arr) {
  return (arr || []).reduce((acc, v) => acc + (v || 0), 0);
}

function finishBaseballGame(roomData, st, sA, sB, walkOff = false) {
  st.winnerTeam = sA > sB ? 'A' : sB > sA ? 'B' : 'DRAW';
  if (st.winnerTeam === 'DRAW') {
    st.loserId = null;
    roomData.roomLastLoserId = null;
    roomData.roomLoserPendingChoice = false;
    st.lastPlay = `🤝 무승부 경기 종료! 청팀 ${sA} : ${sB} 백팀`;
  } else {
    const loseTeam = st.winnerTeam === 'A' ? st.teamB : st.teamA;
    st.loserId = (loseTeam && loseTeam[0]) || null;
    roomData.roomLastLoserId = st.loserId;
    roomData.roomLoserPendingChoice = !!st.loserId;
    st.lastPlay = walkOff
      ? `🎉 끝내기 승리! 경기 종료! 청팀 ${sA} : ${sB} 백팀`
      : `🏆 경기 종료! 청팀 ${sA} : ${sB} 백팀`;
  }
  st.logs.unshift(st.lastPlay);
}

export function resolveBaseballPitch(roomData, st, rng = Math.random) {
  const p = st.pending.pitcher;
  const b = st.pending.batter;
  const px = p.zone % 3;
  const py = Math.floor(p.zone / 3);
  const bx = b.zone % 3;
  const by = Math.floor(b.zone / 3);
  const dist = Math.abs(px - bx) + Math.abs(py - by);
  const isBall = p.option === 'ball';
  st.bases = st.bases || [false, false, false];
  st.scoresA = st.scoresA || [0];
  st.scoresB = st.scoresB || [];
  st.logs = st.logs || [];

  const maxInn = st.maxInnings || 3;

  const addRun = (n) => {
    if (n <= 0) return;
    const arr = st.half === 'top' ? st.scoresA : st.scoresB;
    const idx = st.inning - 1;
    arr[idx] = (arr[idx] || 0) + n;
  };

  const advance = (cnt, isWalk = false) => {
    let runs = 0;
    if (isWalk) {
      if (st.bases[0] && st.bases[1] && st.bases[2]) runs++;
      if (st.bases[0] && st.bases[1]) st.bases[2] = true;
      if (st.bases[0]) st.bases[1] = true;
      st.bases[0] = true;
    } else {
      for (let i = 2; i >= 0; i--) {
        if (st.bases[i]) {
          st.bases[i] = false;
          if (i + cnt >= 3) runs++;
          else st.bases[i + cnt] = true;
        }
      }
      if (cnt >= 4) runs++;
      else st.bases[cnt - 1] = true;
    }
    addRun(runs);
    return runs;
  };

  const checkWalkOff = () => {
    if (st.half !== 'bottom' || st.inning < maxInn) return false;
    const sA = sumScores(st.scoresA);
    const sB = sumScores(st.scoresB);
    if (sB > sA) {
      finishBaseballGame(roomData, st, sA, sB, true);
      return true;
    }
    return false;
  };

  const nextBatter = () => {
    if (st.half === 'top') st.batterIdxA = (st.batterIdxA || 0) + 1;
    else st.batterIdxB = (st.batterIdxB || 0) + 1;
  };

  const recordOut = (msg) => {
    st.outs = (st.outs || 0) + 1;
    st.balls = 0;
    st.strikes = 0;
    nextBatter();
    st.lastPlay = `${msg} (${st.outs}아웃)`;
    st.logs.unshift(`❌ ${st.lastPlay}`);
    if (st.outs >= 3) {
      st.outs = 0;
      st.bases = [false, false, false];
      const sA = sumScores(st.scoresA);
      const sB = sumScores(st.scoresB);
      if (st.half === 'top') {
        if (st.inning >= maxInn && sB > sA) {
          finishBaseballGame(roomData, st, sA, sB, false);
          return;
        }
        st.half = 'bottom';
        st.scoresB[st.inning - 1] = 0;
        st.pitcherIdxA = (st.pitcherIdxA || 0) + 1;
        st.logs.unshift(`🔄 공수 교대! ${st.inning}회말 시작`);
      } else if (st.inning >= maxInn) {
        finishBaseballGame(roomData, st, sA, sB, false);
      } else {
        st.inning += 1;
        st.half = 'top';
        st.scoresA[st.inning - 1] = 0;
        st.pitcherIdxB = (st.pitcherIdxB || 0) + 1;
        st.logs.unshift(`🔄 공수 교대! ${st.inning}회초 시작`);
      }
    }
  };

  if (b.option === 'take') {
    if (isBall || rng() < 0.35) {
      st.balls = (st.balls || 0) + 1;
      if (st.balls >= 4) {
        const r = advance(1, true);
        st.balls = 0;
        st.strikes = 0;
        nextBatter();
        st.lastPlay = `🚶 볼넷 출루!${r ? ` (+${r}득점)` : ''}`;
        st.logs.unshift(st.lastPlay);
        checkWalkOff();
      } else {
        st.lastPlay = `🟢 볼! (${st.balls}B)`;
        st.logs.unshift(st.lastPlay);
      }
    } else {
      st.strikes = (st.strikes || 0) + 1;
      if (st.strikes >= 3) recordOut('루킹 삼진 아웃');
      else {
        st.lastPlay = `🟡 스트라이크! (${st.strikes}S)`;
        st.logs.unshift(st.lastPlay);
      }
    }
  } else if (isBall && dist > 0) {
    st.strikes = (st.strikes || 0) + 1;
    if (st.strikes >= 3) recordOut('헛스윙 삼진 아웃');
    else {
      st.lastPlay = `💨 유인구 헛스윙! (${st.strikes}S)`;
      st.logs.unshift(st.lastPlay);
    }
  } else if (dist === 0) {
    const roll = rng();
    let bases = 1;
    let txt = '👏 중전 안타!';
    if (b.option === 'power') {
      if (roll < 0.45) {
        bases = 4;
        txt = '💥 초대형 홈런!!';
      } else if (roll < 0.8) {
        bases = 2;
        txt = '🔥 2루타!';
      } else {
        bases = 3;
        txt = '⚡ 3루타!';
      }
    } else {
      if (roll < 0.2) {
        bases = 4;
        txt = '💥 홈런!!';
      } else if (roll < 0.55) {
        bases = 2;
        txt = '🔥 2루타!';
      }
    }
    const r = advance(bases);
    st.balls = 0;
    st.strikes = 0;
    nextBatter();
    st.lastPlay = `${txt}${r ? ` (+${r}득점!)` : ''}`;
    st.logs.unshift(st.lastPlay);
    checkWalkOff();
  } else if (dist === 1) {
    const roll = rng();
    if (b.option === 'contact' && roll < 0.5) {
      const r = advance(1);
      st.balls = 0;
      st.strikes = 0;
      nextBatter();
      st.lastPlay = `👏 빗맞은 안타!${r ? ` (+${r}득점)` : ''}`;
      st.logs.unshift(st.lastPlay);
      checkWalkOff();
    } else if (roll < 0.78) {
      if ((st.strikes || 0) < 2) st.strikes = (st.strikes || 0) + 1;
      st.lastPlay = `⚾ 파울! (${st.strikes}S)`;
      st.logs.unshift(st.lastPlay);
    } else {
      recordOut('내야 땅볼/뜬공 아웃');
    }
  } else {
    if (rng() < 0.35) recordOut('외야 플라이 아웃');
    else {
      st.strikes = (st.strikes || 0) + 1;
      if (st.strikes >= 3) recordOut('헛스윙 삼진 아웃');
      else {
        st.lastPlay = `💨 코스 불일치 헛스윙! (${st.strikes}S)`;
        st.logs.unshift(st.lastPlay);
      }
    }
  }

  st.pending = {};
  st.seq = (st.seq || 0) + 1;
  if (st.logs.length > 25) st.logs = st.logs.slice(0, 25);
}
