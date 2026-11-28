export function applyBingoCall(roomData, num, myId) {
  if (!roomData || roomData.selectedGame !== 'bingo' || roomData.status !== 'playing') {
    return undefined;
  }
  const called = roomData.bingoCalled || {};
  if (called[num]) return undefined;

  const turnOrder =
    roomData.bingoTurnOrder && roomData.bingoTurnOrder.length
      ? roomData.bingoTurnOrder
      : Object.keys(roomData.players || {});
  if (turnOrder.length === 0) return undefined;

  const turnIdx = (roomData.bingoTurnIdx || 0) % turnOrder.length;
  if (turnOrder[turnIdx] !== myId) return undefined;

  called[num] = true;
  roomData.bingoCalled = called;
  roomData.bingoTurnIdx = (turnIdx + 1) % turnOrder.length;
  return roomData;
}
