// public/game.js
const socket = io(); // 서버에 연결

// 로컬 스토리지에서 닉네임과 역할군 불러오기
const nickname = localStorage.getItem('nickname');
const playerRole = localStorage.getItem('playerRole') || 'melee'; // 역할군이 없을 경우 기본값

const welcomeMessageElement = document.getElementById('welcome-message');
if (welcomeMessageElement) {
  welcomeMessageElement.textContent = `${nickname}님, ${playerRole} 역할로 게임을 시작합니다!`;
}

// Canvas 요소와 2D 렌더링 컨텍스트 가져오기
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 역할군별 색상 정의 (클라이언트 시각화용) ---
const roleColors = {
    melee: 'red',
    ranged: 'blue',
    assassin: 'purple',
    healer: 'green',
    support: 'orange'
};

// --- 클라이언트에서 관리할 플레이어 정보 (주로 자신의 플레이어 정보 및 UI 표시용) ---
// 실제 authoritative 한 정보는 서버에서 옴
const player = {
    id: null, // 자신의 socket.id
    x: 0, y: 0, radius: 15, color: 'gray',
    nickname: nickname,
    role: playerRole,
    speed: 0, // 서버에서 받아올 것
    health: 0, maxHealth: 0,
    mana: 0, maxMana: 0,
    basicAttackCooldown: 0, skill1Cooldown: 0, skill2Cooldown: 0,
    isDashing: false, dashRemainingTime: 0, // 돌진 효과를 위한 상태
    isShielded: false, shieldRemainingTime: 0, // 방어막 효과를 위한 상태
    isEnhancedAttack: false, enhancedAttackRemainingTime: 0, // 평타 강화 효과를 위한 상태
    isPiercingShotMode: false, piercingShotModeRemainingTime: 0, piercingShotTimer: 0, // 관통 사격 모드
    isInvisible: false, invisibleRemainingTime: 0, // 은신 효과를 위한 상태
    // 서버가 관리할 기본 속성들을 여기에 미러링 (쿨타임, 마나 등 UI 표시용)
};

// 다른 플레이어 정보를 저장할 객체 (서버에서 주기적으로 업데이트 받음)
const otherPlayers = {};
const serverProjectiles = []; // 서버에서 전송받은 발사체
const clientMeleeAttacks = []; // 서버에서 받은 근접 공격 시각 효과
const clientAssassinStabs = []; // 서버에서 받은 암살자 공격 시각 효과

// --- 키보드 입력 상태를 저장할 객체 ---
const keys = {
  ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
  w: false, a: false, s: false, d: false,
  q: false,     // 스킬 1 (Q 키)
  e: false      // 스킬 2 (E 키)
};

// --- 마우스 위치를 저장할 객체 ---
const mouse = {
    x: 0,
    y: 0,
    leftClick: false // 좌클릭 상태
};

// 클라이언트에서 스킬 정보 (UI 표시용)
const clientRoles = {
    melee: { skill1Name: "돌진", skill2Name: "방어막", basicAttackManaCost: 10, skill1ManaCost: 40, skill2ManaCost: 50 },
    ranged: { skill1Name: "관통 사격", skill2Name: "폭발 화살", basicAttackManaCost: 5, skill1ManaCost: 30, skill2ManaCost: 40 },
    assassin: { skill1Name: "은신", skill2Name: "순간이동", basicAttackManaCost: 5, skill1ManaCost: 60, skill2ManaCost: 20 },
    healer: { skill1Name: "치유의 물결", skill2Name: "보호막", basicAttackManaCost: 5, skill1ManaCost: 30, skill2ManaCost: 40 },
    support: { skill1Name: "속도 증폭", skill2Name: "속박의 덫", basicAttackManaCost: 5, skill1ManaCost: 15, skill2ManaCost: 25 }
};
const currentPlayerRoleInfo = clientRoles[playerRole];

// --- Socket.IO 이벤트 리스너 ---

// 서버 연결 시 자신의 ID와 초기 정보 전송
socket.on('connect', () => {
    player.id = socket.id;
    socket.emit('playerInit', { nickname: nickname, playerRole: playerRole });
});

// 서버로부터 현재 모든 플레이어 정보 수신
socket.on('currentPlayers', (allPlayers) => {
    for (let id in allPlayers) {
        if (id === player.id) {
            // 자신의 플레이어 정보 초기화 (서버에서 받은 것으로)
            Object.assign(player, allPlayers[id]);
            player.color = roleColors[player.role]; // 자신의 색상 설정
        } else {
            otherPlayers[id] = allPlayers[id];
            otherPlayers[id].color = roleColors[otherPlayers[id].role]; // 다른 플레이어 색상 설정
        }
    }
});

// 서버로부터 새로운 플레이어 접속 알림 수신
socket.on('newPlayer', (playerInfo) => {
    if (playerInfo.id !== player.id) {
        otherPlayers[playerInfo.id] = playerInfo;
        otherPlayers[playerInfo.id].color = roleColors[playerInfo.role]; // 색상 설정
    }
});

// 서버로부터 플레이어 연결 해제 알림 수신
socket.on('playerDisconnected', (playerId) => {
    delete otherPlayers[playerId];
});

// 서버로부터 최신 게임 상태 수신 (매 프레임)
socket.on('gameState', (gameState) => {
    for (const id in gameState.players) {
        if (id === player.id) {
            // 자신의 플레이어 정보는 서버 데이터로 보정
            Object.assign(player, gameState.players[id]);
            player.color = roleColors[player.role]; // 자신의 색상 유지
        } else {
            // 다른 플레이어 정보 업데이트
            if (otherPlayers[id]) {
                Object.assign(otherPlayers[id], gameState.players[id]);
                otherPlayers[id].color = roleColors[otherPlayers[id].role]; // 다른 플레이어 색상 유지
            } else { // 아직 없는 플레이어 (새로 접속했는데 currentPlayers를 받기 전일 수도)
                otherPlayers[id] = gameState.players[id];
                otherPlayers[id].color = roleColors[otherPlayers[id].role]; // 색상 설정
            }
        }
    }
    // 발사체 업데이트
    serverProjectiles.splice(0, serverProjectiles.length, ...gameState.projectiles);
    // 근접 공격 효과 업데이트
    clientMeleeAttacks.splice(0, clientMeleeAttacks.length, ...gameState.meleeAttacks);
    // 암살자 단검 찌르기 효과 업데이트
    clientAssassinStabs.splice(0, clientAssassinStabs.length, ...gameState.assassinStabs);
});

// 서버로부터 플레이어 체력 업데이트 알림 수신 (개별 이벤트)
socket.on('playerHealthUpdate', (data) => {
    if (data.id === player.id) {
        player.health = data.health;
    } else if (otherPlayers[data.id]) {
        otherPlayers[data.id].health = data.health;
    }
});

// 서버로부터 스킬 효과 알림 수신 (클라이언트에서 시각적 효과만)
socket.on('playerDashed', (data) => {
    if (otherPlayers[data.id]) {
        otherPlayers[data.id].isDashing = true;
        otherPlayers[data.id].dashRemainingTime = data.duration;
        // 클라이언트 예측과 서버 보정의 일환으로 바로 위치 업데이트
        otherPlayers[data.id].x = data.targetX;
        otherPlayers[data.id].y = data.targetY;
    }
});

socket.on('playerShielded', (data) => {
    if (data.id === player.id) {
        player.isShielded = true;
        player.shieldRemainingTime = data.duration;
    } else if (otherPlayers[data.id]) {
        otherPlayers[data.id].isShielded = true;
        otherPlayers[data.id].shieldRemainingTime = data.duration;
    }
});

socket.on('playerEnhancedAttack', (data) => {
    if (data.id === player.id) {
        player.isEnhancedAttack = true;
        player.enhancedAttackRemainingTime = data.duration;
    } else if (otherPlayers[data.id]) {
        otherPlayers[data.id].isEnhancedAttack = true;
        otherPlayers[data.id].enhancedAttackRemainingTime = data.duration;
    }
});

socket.on('playerPiercingShotMode', (data) => {
    if (data.id === player.id) {
        player.isPiercingShotMode = true;
        player.piercingShotModeRemainingTime = data.duration;
    } else if (otherPlayers[data.id]) {
        otherPlayers[data.id].isPiercingShotMode = true;
        otherPlayers[data.id].piercingShotModeRemainingTime = data.duration;
    }
});

socket.on('playerInvisibled', (data) => {
    if (data.id === player.id) {
        player.isInvisible = true;
        player.invisibleRemainingTime = data.duration;
    } else if (otherPlayers[data.id]) {
        otherPlayers[data.id].isInvisible = true;
        otherPlayers[data.id].invisibleRemainingTime = data.duration;
    }
});

socket.on('playerTeleported', (data) => {
    if (data.id === player.id) {
        player.x = data.x;
        player.y = data.y;
    } else if (otherPlayers[data.id]) {
        otherPlayers[data.id].x = data.x;
        otherPlayers[data.id].y = data.y;
    }
});

socket.on('explosionEffect', (data) => {
    // 서버에서 폭발 발생 알림을 받으면 클라이언트에서 폭발 효과 생성
    explosions.push({ x: data.x, y: data.y, radius: 10, alpha: 1 });
});


// --- 그리기 함수 ---

// 플레이어 그리기 함수 (자신과 다른 플레이어 모두)
function drawPlayer(p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);

    // 암살자 은신 시 투명도 조절
    if (p.role === 'assassin' && p.isInvisible) {
        if (p.id === player.id) { // 자기 자신은 흐리게 보임
            ctx.fillStyle = `rgba(150, 0, 150, 0.3)`;
        } else { // 다른 플레이어가 암살자이고 은신 중이라면 (나에게 보이는 투명도)
            // 나(player)와 은신 중인 다른 플레이어(p) 사이의 거리
            const distToAssassin = Math.sqrt(Math.pow(player.x - p.x, 2) + Math.pow(player.y - p.y, 2));
            const detectionRange = 70; // 감지 범위

            if (distToAssassin < detectionRange) { // 감지 범위 이내
                ctx.fillStyle = `rgba(150, 0, 150, 0.15)`; // 연하게 보임
            } else { // 감지 범위 밖
                ctx.fillStyle = `rgba(150, 0, 150, 0.0)`; // 완전히 안 보임
            }
        }
    } else {
        ctx.fillStyle = p.color;
    }
    ctx.fill();
    ctx.closePath();

    // 닉네임 그리기
    ctx.fillStyle = 'black';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(p.nickname, p.x, p.y - p.radius - 5);
    ctx.textAlign = 'left'; // 기본값으로 되돌리기

    // 체력 바 그리기
    const healthBarWidth = 30;
    const healthBarHeight = 5;
    const healthBarX = p.x - healthBarWidth / 2;
    const healthBarY = p.y + p.radius + 5;
    ctx.fillStyle = 'gray';
    ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
    ctx.fillStyle = 'lime';
    ctx.fillRect(healthBarX, healthBarY, (p.health / p.maxHealth) * healthBarWidth, healthBarHeight);


    // 방어막 시각화
    if (p.isShielded) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(100, 100, 255, 0.7)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.closePath();
    }
}

// 발사체 그리기
function drawProjectiles() {
    for (const p of serverProjectiles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.closePath();
    }
}

// 근접 공격 효과 그리기
function drawMeleeAttacks() {
    for (let i = clientMeleeAttacks.length - 1; i >= 0; i--) {
        const attack = clientMeleeAttacks[i];
        ctx.save();
        ctx.translate(attack.x, attack.y);
        ctx.rotate(attack.angle);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, attack.radius, -Math.PI / 4, Math.PI / 4); // 예시 각도
        ctx.closePath();
        ctx.fillStyle = `rgba(200, 50, 50, ${attack.alpha || 1})`; // 서버에서 alpha를 안 보내면 1

        // 클라이언트에서 애니메이션 효과를 위해 alpha 값 감소
        if (!attack.initAlpha) attack.initAlpha = 1; // 초기 알파 값 저장
        attack.alpha = attack.initAlpha * (attack.duration / 5); // 5프레임 기준으로 감소
        if (attack.alpha < 0) attack.alpha = 0;

        ctx.fill();
        ctx.restore();

        attack.duration--;
        if (attack.duration <= 0) {
            clientMeleeAttacks.splice(i, 1);
        }
    }
}

// 암살자 단검 찌르기 그리기
function drawAssassinStabs() {
    for (let i = clientAssassinStabs.length - 1; i >= 0; i--) {
        const stab = clientAssassinStabs[i];
        ctx.save();
        ctx.translate(stab.x, stab.y);
        ctx.rotate(stab.angle);

        ctx.beginPath();
        ctx.rect(-stab.width / 2, -stab.height / 2, stab.width, stab.height); // 플레이어 중심에서 나오도록
        ctx.fillStyle = `rgba(100, 100, 100, ${stab.alpha || 1})`;

        // 클라이언트에서 애니메이션 효과를 위해 alpha 값 감소
        if (!stab.initAlpha) stab.initAlpha = 1;
        stab.alpha = stab.initAlpha * (stab.duration / 5);
        if (stab.alpha < 0) stab.alpha = 0;

        ctx.fill();
        ctx.closePath();

        ctx.restore();

        stab.duration--;
        if (stab.duration <= 0) {
            clientAssassinStabs.splice(i, 1);
        }
    }
}

const explosions = []; // 클라이언트에서 생성되는 폭발 효과
function drawExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 165, 0, ${explosion.alpha})`; // 주황색 폭발
        ctx.fill();
        ctx.closePath();

        explosion.radius += 1;
        explosion.alpha -= 0.03;

        if (explosion.alpha <= 0) {
            explosions.splice(i, 1);
        }
    }
}


// --- UI 업데이트 함수 ---
function updateUI() {
    ctx.fillStyle = 'black';
    ctx.font = '16px Arial';
    ctx.fillText(`체력: ${Math.floor(player.health)}/${player.maxHealth}`, 10, 30);
    ctx.fillText(`마나: ${Math.floor(player.mana)}/${player.maxMana}`, 10, 50);
    ctx.fillText(`기본 공격 쿨: ${(Math.max(0, player.basicAttackCooldown / 60)).toFixed(1)}s`, 10, 70);
    ctx.fillText(`${currentPlayerRoleInfo.skill1Name} 쿨: ${(Math.max(0, player.skill1Cooldown / 60)).toFixed(1)}s`, 10, 90);
    ctx.fillText(`${currentPlayerRoleInfo.skill2Name} 쿨: ${(Math.max(0, player.skill2Cooldown / 60)).toFixed(1)}s`, 10, 110);
    ctx.fillText(`역할: ${player.role}`, 10, 130);
    ctx.fillText(`내 ID: ${player.id.substring(0, 4)}`, 10, 150);


    // 방어막 활성화 상태 표시
    if (player.isShielded) {
        ctx.fillStyle = 'blue';
        ctx.fillText(`방어막 활성화! (${(player.shieldRemainingTime / 60).toFixed(1)}s 남음)`, 10, canvas.height - 30);
    }

    // 평타 강화 상태 표시
    if (player.isEnhancedAttack) {
        ctx.fillStyle = 'gold';
        ctx.fillText(`평타 강화! (${(player.enhancedAttackRemainingTime / 60).toFixed(1)}s 남음)`, 10, canvas.height - 50);
    }

    // 관통 사격 모드 활성화 상태 표시
    if (player.isPiercingShotMode) {
        ctx.fillStyle = 'darkgreen';
        ctx.fillText(`관통 사격 모드! (${(player.piercingShotModeRemainingTime / 60).toFixed(1)}s 남음)`, 10, canvas.height - 70);
    }

    // 은신 상태 표시
    if (player.isInvisible) {
        ctx.fillStyle = 'purple';
        ctx.fillText(`은신 활성화! (${(player.invisibleRemainingTime / 60).toFixed(1)}s 남음)`, 10, canvas.height - 90);
        // 클라이언트에서는 자신만 흐리게 보이므로 "다른 사람에게 보임/안보임" UI는 제거 (서버에서 판정하므로)
        // 실제로는 서버에서 플레이어 A가 플레이어 B를 '감지했음' 이벤트를 보내주면 UI에 표시 가능
    }
}

// --- 사용자 입력 (키보드, 마우스) 이벤트 리스너 ---
window.addEventListener('keydown', (e) => {
  if (keys.hasOwnProperty(e.key.toLowerCase())) {
    keys[e.key.toLowerCase()] = true; // 소문자로 변환
  }
});

window.addEventListener('keyup', (e) => {
  if (keys.hasOwnProperty(e.key.toLowerCase())) {
    keys[e.key.toLowerCase()] = false; // 소문자로 변환
  }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // 좌클릭 (0)
        mouse.leftClick = true;
        // 기본 공격 이벤트 서버로 전송
        const angleToMouse = Math.atan2(mouse.y - player.y, mouse.x - player.x);
        socket.emit('basicAttack', {
            directionX: Math.cos(angleToMouse),
            directionY: Math.sin(angleToMouse),
            angle: angleToMouse // 근접/암살자 공격용 각도
        });
        // 클라이언트에서 즉시 쿨타임 적용 (예측)
        // 실제 쿨타임은 서버에서 관리하고 동기화됨
        // player.basicAttackCooldown = clientRoles[player.role].basicAttackCooldownTime;
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        mouse.leftClick = false;
    }
});

// 스킬 키 입력 (서버로 이벤트 전송)
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'q') {
        // 클라이언트에서 스킬 사용 가능 여부 1차 체크 (UI 피드백용)
        if (player.skill1Cooldown <= 0 && player.mana >= currentPlayerRoleInfo.skill1ManaCost) {
            const angleToMouse = Math.atan2(mouse.y - player.y, mouse.x - player.x);
            socket.emit('useSkill1', { targetX: mouse.x, targetY: mouse.y, angle: angleToMouse });
            // 클라이언트 예측: 스킬 쿨타임을 즉시 적용하여 빠른 UI 반응
            player.skill1Cooldown = clientRoles[player.role].skill1CooldownTime; // TODO: 서버의 쿨타임 값으로 변경
        }
    } else if (e.key.toLowerCase() === 'e') {
        if (player.skill2Cooldown <= 0 && player.mana >= currentPlayerRoleInfo.skill2ManaCost) {
            const angleToMouse = Math.atan2(mouse.y - player.y, mouse.x - player.x);
            socket.emit('useSkill2', { targetX: mouse.x, targetY: mouse.y, angle: angleToMouse });
            // 클라이언트 예측
            player.skill2Cooldown = clientRoles[player.role].skill2CooldownTime; // TODO: 서버의 쿨타임 값으로 변경
        }
    }
});


// --- 게임 루프 (애니메이션 프레임 요청) ---
function gameLoop() {
  // 1. 화면 지우기
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 2. 서버로 플레이어 이동 입력 전송 (매 프레임)
  socket.emit('playerMovement', {
      up: keys.w || keys.ArrowUp,
      down: keys.s || keys.ArrowDown,
      left: keys.a || keys.ArrowLeft,
      right: keys.d || keys.ArrowRight
  });

  // 3. 플레이어 그리기 (자신)
  if (player.id) { // 플레이어 정보가 서버로부터 초기화되면
    drawPlayer(player);
  }

  // 4. 다른 플레이어 그리기
  for (const id in otherPlayers) {
      drawPlayer(otherPlayers[id]);
  }

  // 5. 발사체 그리기 (서버에서 받은 데이터 기반)
  drawProjectiles();

  // 6. 근접 공격 효과 그리기 (서버에서 받은 데이터 기반)
  drawMeleeAttacks();

  // 7. 암살자 단검 찌르기 그리기 (서버에서 받은 데이터 기반)
  drawAssassinStabs();

  // 8. 폭발 효과 그리기 (클라이언트에서 생성)
  drawExplosions();

  // 9. UI 업데이트
  updateUI();

  // 다음 프레임 요청
  requestAnimationFrame(gameLoop);
}

// 게임 시작
gameLoop();