// server.js
const express = require('express');
const http = require('http');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new socketio.Server(server, {
    cors: {
        origin: "*", // 개발 단계에서만 * 사용, 배포 시 특정 도메인으로 제한
        methods: ["GET", "POST"]
    }
});

// public 폴더의 정적 파일 제공
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// --- 서버에서 관리할 게임 상태 ---
const players = {}; // { socketId: { x, y, role, health, ... }, ... }
const projectiles = []; // 발사체 정보 (서버에서 생성, 이동, 충돌 처리)
const meleeAttacksData = []; // 근접 공격 시각 효과 정보 (데미지는 서버에서 처리, 클라이언트는 효과만)
const assassinStabsData = []; // 암살자 단검 찌르기 시각 효과 정보

// 역할군별 기본 속성 (서버에서 관리)
const roles = {
    melee: {
        basicAttackDamage: 1300,
        basicAttackCooldownTime: 30, // 프레임 단위
        basicAttackManaCost: 10,
        skill1Name: "돌진",
        skill1CooldownTime: 20 * 60, // 20초
        skill1ManaCost: 40,
        skill1Duration: 1 * 60, // 1초
        skill1SpeedMultiplier: 1.5,
        skill2Name: "방어막",
        skill2CooldownTime: 25 * 60, // 25초
        skill2ManaCost: 50,
        skill2Duration: 7 * 60, // 7초
        damageReduction: 0.5,
        speed: 3,
        health: 8000
    },
    ranged: {
        basicAttackDamage: 30,
        basicAttackCooldownTime: 20,
        basicAttackManaCost: 5,
        skill1Name: "관통 사격",
        skill1CooldownTime: 15 * 60,
        skill1ManaCost: 30,
        skill1ModeDuration: 10 * 60,
        skill1ArrowDamage: 50,
        skill2Name: "폭발 화살",
        skill2CooldownTime: 17 * 60,
        skill2ManaCost: 40,
        skill2Duration: 8 * 60,
        speed: 3,
        health: 3300
    },
    assassin: {
        basicAttackDamage: 100,
        basicAttackCooldownTime: 15, // 0.25초
        basicAttackManaCost: 5,
        skill1Name: "은신",
        skill1CooldownTime: 18 * 60, // 18초
        skill1ManaCost: 60,
        skill1Duration: 8 * 60, // 8초
        skill2Name: "순간이동",
        skill2CooldownTime: 1 * 60, // 1초
        skill2ManaCost: 20,
        skill2TeleportDistance: 100,
        speed: 5, // 매우 빠름
        health: 3500 // 암살자 체력 3500
    },
    healer: { // 임시 값
        basicAttackDamage: 30, basicAttackCooldownTime: 25, basicAttackManaCost: 5,
        skill1Name: "치유의 물결", skill1CooldownTime: 15 * 60, skill1ManaCost: 30,
        skill2Name: "보호막", skill2CooldownTime: 18 * 60, skill2ManaCost: 40,
        speed: 3, health: 6000
    },
    support: { // 임시 값
        basicAttackDamage: 40, basicAttackCooldownTime: 20, basicAttackManaCost: 5,
        skill1Name: "속도 증폭", skill1CooldownTime: 10 * 60, skill1ManaCost: 15,
        skill2Name: "속박의 덫", skill2CooldownTime: 12 * 60, skill2ManaCost: 25,
        speed: 3, health: 7000
    }
};

// --- Socket.IO 연결 이벤트 ---
io.on('connection', (socket) => {
    console.log(`새로운 플레이어 연결됨: ${socket.id}`);

    let playerRole = 'melee'; // 기본 역할군 (클라이언트에서 설정한 역할군 받아올 예정)
    let nickname = `Guest_${socket.id.substring(0, 4)}`; // 기본 닉네임

    // 클라이언트로부터 닉네임과 역할군 수신
    socket.on('playerInit', (data) => {
        nickname = data.nickname || `Guest_${socket.id.substring(0, 4)}`;
        playerRole = data.playerRole || 'melee';

        const roleData = roles[playerRole];

        // 새로운 플레이어 초기화 (서버에서 모든 상태 관리)
        players[socket.id] = {
            id: socket.id,
            nickname: nickname,
            x: Math.random() * (800 - 30) + 15, // 캔버스 범위 내 랜덤 초기 위치
            y: Math.random() * (600 - 30) + 15,
            radius: 15, // 클라이언트에서 그리기 위함
            color: 'gray', // 클라이언트에서 역할군 색상 적용
            role: playerRole,
            speed: roleData.speed,
            health: roleData.health,
            maxHealth: roleData.health,
            mana: 200, // 마나 기본값
            maxMana: 200,
            basicAttackCooldown: 0,
            skill1Cooldown: 0,
            skill2Cooldown: 0,
            // 역할군별 특정 상태
            isDashing: false,
            dashRemainingTime: 0,
            dashTargetX: 0,
            dashTargetY: 0,
            dashSpeedX: 0,
            dashSpeedY: 0,
            isShielded: false,
            shieldRemainingTime: 0,
            damageReduction: 0,
            isEnhancedAttack: false,
            enhancedAttackRemainingTime: 0,
            attackMultiplier: 1,
            isPiercingShotMode: false,
            piercingShotModeRemainingTime: 0,
            piercingShotTimer: 0,
            isInvisible: false,
            invisibleRemainingTime: 0
        };
        console.log(`${nickname}(${playerRole}) 플레이어 (${socket.id}) 연결됨`);
        // 새로 연결된 플레이어에게 현재 모든 플레이어 정보 전송
        socket.emit('currentPlayers', players);
        // 다른 모든 플레이어에게 새로운 플레이어 접속 알림
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });


    // 플레이어 이동 입력 수신
    socket.on('playerMovement', (movementData) => {
        const player = players[socket.id];
        if (player && !player.isDashing) { // 돌진 중이 아닐 때만 일반 이동 처리
            // 클라이언트에서 보낸 이동 입력에 따라 서버에서 위치 업데이트
            if (movementData.up) player.y -= player.speed;
            if (movementData.down) player.y += player.speed;
            if (movementData.left) player.x -= player.speed;
            if (movementData.right) player.x += player.speed;

            // 경계 설정 (서버에서 최종 위치 결정)
            player.x = Math.min(canvas.width - player.radius, Math.max(player.radius, player.x));
            player.y = Math.min(canvas.height - player.radius, Math.max(player.radius, player.y));
        }
    });

    // 기본 공격 이벤트 수신
    socket.on('basicAttack', (attackData) => {
        const player = players[socket.id];
        const roleData = roles[player.role];

        if (player && player.basicAttackCooldown <= 0 && player.mana >= roleData.basicAttackManaCost) {
            player.mana -= roleData.basicAttackManaCost;
            player.basicAttackCooldown = roleData.basicAttackCooldownTime;

            if (player.role === 'ranged') {
                const projectile = {
                    id: Math.random().toString(36).substr(2, 9),
                    x: player.x,
                    y: player.y,
                    radius: 3,
                    color: 'blue',
                    speed: 10,
                    directionX: attackData.directionX,
                    directionY: attackData.directionY,
                    damage: roleData.basicAttackDamage * (player.isEnhancedAttack ? player.attackMultiplier : 1),
                    piercing: false,
                    isSkill: false,
                    explosive: player.isEnhancedAttack,
                    ownerId: socket.id
                };
                projectiles.push(projectile);
            } else if (player.role === 'melee') {
                // 근접 공격 효과를 모든 클라이언트에 전송
                meleeAttacksData.push({
                    id: Math.random().toString(36).substr(2, 9),
                    x: player.x,
                    y: player.y,
                    angle: attackData.angle,
                    radius: 60, // 클라이언트에서 그릴 반경
                    ownerId: socket.id,
                    duration: 5 // 클라이언트 이펙트 지속 시간
                });
                // TODO: 서버에서 실제 충돌 판정 및 데미지 적용 로직
                // 현재는 플레이어 기준으로 간단한 원형 충돌로 처리
                for (const otherId in players) {
                    if (otherId === socket.id) continue; // 자기 자신 제외
                    const otherPlayer = players[otherId];
                    const dist = Math.sqrt(Math.pow(player.x - otherPlayer.x, 2) + Math.pow(player.y - otherPlayer.y, 2));
                    if (dist < player.radius + 60) { // 플레이어 반지름 + 공격 반경
                        const damage = roleData.basicAttackDamage;
                        const finalDamage = otherPlayer.isShielded ? damage * (1 - otherPlayer.damageReduction) : damage;
                        otherPlayer.health -= finalDamage;
                        io.emit('playerHealthUpdate', { id: otherId, health: otherPlayer.health });
                        console.log(`${otherPlayer.nickname} (${otherId})가 ${finalDamage.toFixed(0)} 데미지를 입었습니다. 남은 체력: ${otherPlayer.health.toFixed(0)}`);
                    }
                }

            } else if (player.role === 'assassin') {
                // 암살자 단검 찌르기 효과를 모든 클라이언트에 전송
                assassinStabsData.push({
                    id: Math.random().toString(36).substr(2, 9),
                    x: player.x,
                    y: player.y,
                    angle: attackData.angle,
                    width: 10, height: 25, // 클라이언트에서 그릴 단검 크기
                    ownerId: socket.id,
                    duration: 5
                });
                // TODO: 서버에서 실제 충돌 판정 및 데미지 적용 로직
                // 현재는 플레이어 기준으로 간단한 원형 충돌로 처리
                for (const otherId in players) {
                    if (otherId === socket.id) continue; // 자기 자신 제외
                    const otherPlayer = players[otherId];
                    const dist = Math.sqrt(Math.pow(player.x - otherPlayer.x, 2) + Math.pow(player.y - otherPlayer.y, 2));
                    // 단검이 플레이어에게 닿았다고 가정 (대략적인 거리)
                    if (dist < player.radius + 20) {
                        const damage = roleData.basicAttackDamage;
                        const finalDamage = otherPlayer.isShielded ? damage * (1 - otherPlayer.damageReduction) : damage;
                        otherPlayer.health -= finalDamage;
                        io.emit('playerHealthUpdate', { id: otherId, health: otherPlayer.health });
                        console.log(`${otherPlayer.nickname} (${otherId})가 ${finalDamage.toFixed(0)} 데미지를 입었습니다. 남은 체력: ${otherPlayer.health.toFixed(0)}`);
                    }
                }
            }
        }
    });

    // Q 스킬 사용 이벤트 수신
    socket.on('useSkill1', (skillData) => {
        const player = players[socket.id];
        const roleData = roles[player.role];

        if (player && player.skill1Cooldown <= 0 && player.mana >= roleData.skill1ManaCost) {
            player.mana -= roleData.skill1ManaCost;
            player.skill1Cooldown = roleData.skill1CooldownTime;

            if (player.role === 'melee') {
                player.isDashing = true;
                player.dashRemainingTime = roleData.skill1Duration;
                player.dashTargetX = skillData.targetX;
                player.dashTargetY = skillData.targetY;

                const dx = skillData.targetX - player.x;
                const dy = skillData.targetY - player.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > 0) {
                    const baseSpeed = distance / roleData.skill1Duration;
                    player.dashSpeedX = (dx / distance) * baseSpeed * roleData.skill1SpeedMultiplier;
                    player.dashSpeedY = (dy / distance) * baseSpeed * roleData.skill1SpeedMultiplier;
                } else {
                    player.dashSpeedX = 0;
                    player.dashSpeedY = 0;
                }
                io.emit('playerDashed', { id: socket.id, targetX: skillData.targetX, targetY: skillData.targetY, duration: roleData.skill1Duration });
                console.log(`${player.nickname}(근접)이 돌진 스킬을 사용했습니다!`);

            } else if (player.role === 'ranged') {
                player.isPiercingShotMode = true;
                player.piercingShotModeRemainingTime = roleData.skill1ModeDuration;
                player.piercingShotTimer = 0; // 즉시 발사되도록
                io.emit('playerPiercingShotMode', { id: socket.id, duration: roleData.skill1ModeDuration });
                // Q 스킬 발동 시 즉시 1발 발사
                // 서버에서 발사체 생성
                const angleToMouse = skillData.angle; // 클라이언트에서 마우스 각도 받아옴
                const projectile = {
                    id: Math.random().toString(36).substr(2, 9),
                    x: player.x,
                    y: player.y,
                    radius: 4,
                    color: 'darkgreen',
                    speed: 15,
                    directionX: Math.cos(angleToMouse),
                    directionY: Math.sin(angleToMouse),
                    damage: roleData.skill1ArrowDamage,
                    piercing: true,
                    isSkill: true,
                    ownerId: socket.id
                };
                projectiles.push(projectile);

            } else if (player.role === 'assassin') {
                player.isInvisible = true;
                player.invisibleRemainingTime = roleData.skill1Duration;
                io.emit('playerInvisibled', { id: socket.id, duration: roleData.skill1Duration });
                console.log(`${player.nickname}(암살자)이 은신 스킬을 사용했습니다!`);
            }
        }
    });

    // E 스킬 사용 이벤트 수신
    socket.on('useSkill2', (skillData) => {
        const player = players[socket.id];
        const roleData = roles[player.role];

        if (player && player.skill2Cooldown <= 0 && player.mana >= roleData.skill2ManaCost) {
            player.mana -= roleData.skill2ManaCost;
            player.skill2Cooldown = roleData.skill2CooldownTime;

            if (player.role === 'melee') {
                player.isShielded = true;
                player.shieldRemainingTime = roleData.skill2Duration;
                player.damageReduction = roleData.damageReduction;
                io.emit('playerShielded', { id: socket.id, duration: roleData.skill2Duration });
                console.log(`${player.nickname}(근접)이 방어막 스킬을 사용했습니다!`);

            } else if (player.role === 'ranged') {
                player.isEnhancedAttack = true;
                player.enhancedAttackRemainingTime = roleData.skill2Duration;
                player.attackMultiplier = 1.5; // E 스킬로 인한 공격력 배율
                io.emit('playerEnhancedAttack', { id: socket.id, duration: roleData.skill2Duration });
                console.log(`${player.nickname}(원거리)이 폭발 화살 스킬을 사용했습니다!`);

            } else if (player.role === 'assassin') {
                const dx = skillData.targetX - player.x;
                const dy = skillData.targetY - player.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                let teleportX = player.x;
                let teleportY = player.y;

                if (distance > 0) {
                    teleportX = player.x + (dx / distance) * roleData.skill2TeleportDistance;
                    teleportY = player.y + (dy / distance) * roleData.skill2TeleportDistance;
                }

                // 경계 체크
                teleportX = Math.min(canvas.width - player.radius, Math.max(player.radius, teleportX));
                teleportY = Math.min(canvas.height - player.radius, Math.max(player.radius, teleportY));

                player.x = teleportX;
                player.y = teleportY;
                io.emit('playerTeleported', { id: socket.id, x: player.x, y: player.y });
                console.log(`${player.nickname}(암살자)이 순간이동 스킬을 사용했습니다!`);
            }
        }
    });

    // 연결 끊김 이벤트
    socket.on('disconnect', () => {
        console.log(`플레이어 연결 해제됨: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id); // 다른 모든 플레이어에게 알림
    });
});

// --- 서버 게임 루프 (초당 60회 업데이트) ---
const CANVAS_WIDTH = 800; // 클라이언트 캔버스 크기와 일치
const CANVAS_HEIGHT = 600;

setInterval(() => {
    // 모든 플레이어 상태 업데이트
    for (const id in players) {
        const player = players[id];
        const roleData = roles[player.role];

        // 마나 자동 회복
        player.mana = Math.min(player.maxMana, player.mana + 10 / 60);

        // 쿨타임 감소
        if (player.basicAttackCooldown > 0) player.basicAttackCooldown--;
        if (player.skill1Cooldown > 0) player.skill1Cooldown--;
        if (player.skill2Cooldown > 0) player.skill2Cooldown--;

        // 근접 딜러 돌진 상태 업데이트 (서버에서 이동)
        if (player.isDashing) {
            player.x += player.dashSpeedX;
            player.y += player.dashSpeedY;
            player.dashRemainingTime--;

            // 돌진 목표 지점 도달 또는 시간 만료 시
            const dxRemaining = player.dashTargetX - player.x;
            const dyRemaining = player.dashTargetY - player.y;
            const distanceRemaining = Math.sqrt(dxRemaining * dxRemaining + dyRemaining * dyRemaining);

            if (player.dashRemainingTime <= 0 || distanceRemaining < player.speed) { // 거의 도달했거나 시간 만료
                player.isDashing = false;
                player.x = Math.min(CANVAS_WIDTH - player.radius, Math.max(player.radius, player.x));
                player.y = Math.min(CANVAS_HEIGHT - player.radius, Math.max(player.radius, player.y));
            }
        }

        // 근접 딜러 방어막 상태 업데이트
        if (player.isShielded) {
            player.shieldRemainingTime--;
            if (player.shieldRemainingTime <= 0) {
                player.isShielded = false;
                player.damageReduction = 0;
            }
        }

        // 원거리 딜러 평타 강화 상태 업데이트
        if (player.isEnhancedAttack) {
            player.enhancedAttackRemainingTime--;
            if (player.enhancedAttackRemainingTime <= 0) {
                player.isEnhancedAttack = false;
                player.attackMultiplier = 1;
            }
        }

        // 원거리 딜러 Q 스킬 (관통 사격 모드) 업데이트
        if (player.isPiercingShotMode) {
            player.piercingShotModeRemainingTime--;
            player.piercingShotTimer--;

            if (player.piercingShotTimer <= 0) {
                // 서버에서 관통 화살 발사
                const targetX = Math.random() * CANVAS_WIDTH; // 임시 타겟
                const targetY = Math.random() * CANVAS_HEIGHT; // 임시 타겟
                const angleToTarget = Math.atan2(targetY - player.y, targetX - player.x);

                const projectile = {
                    id: Math.random().toString(36).substr(2, 9),
                    x: player.x,
                    y: player.y,
                    radius: 4,
                    color: 'darkgreen',
                    speed: 15,
                    directionX: Math.cos(angleToTarget),
                    directionY: Math.sin(angleToTarget),
                    damage: roleData.skill1ArrowDamage,
                    piercing: true,
                    isSkill: true,
                    ownerId: id // 발사한 플레이어 ID
                };
                projectiles.push(projectile);
                player.piercingShotTimer = roles.ranged.piercingShotInterval;
            }

            if (player.piercingShotModeRemainingTime <= 0) {
                player.isPiercingShotMode = false;
            }
        }

        // 암살자 은신 상태 업데이트
        if (player.isInvisible) {
            player.invisibleRemainingTime--;
            if (player.invisibleRemainingTime <= 0) {
                player.isInvisible = false;
            }
        }
    }

    // 발사체 위치 업데이트 및 충돌 처리
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.speed * p.directionX;
        p.y += p.speed * p.directionY;

        // 화면 밖으로 나가면 제거
        if (p.x - p.radius < 0 || p.x + p.radius > CANVAS_WIDTH || p.y - p.radius < 0 || p.y + p.radius > CANVAS_HEIGHT) {
            if (p.explosive) {
                // 폭발 효과는 클라이언트에 전송 (서버는 데미지 판정만)
                io.emit('explosionEffect', { x: p.x, y: p.y });
                // TODO: 폭발 범위 내 적/플레이어 데미지 처리
            }
            if (!p.piercing) { // 관통이 아닌 발사체만 제거
                projectiles.splice(i, 1);
            }
            continue;
        }

        // 다른 플레이어와의 충돌 감지 (데미지 적용)
        for (const id in players) {
            const otherPlayer = players[id];
            if (otherPlayer.id === p.ownerId) continue; // 자기 자신에게 데미지 주지 않음

            const dx = p.x - otherPlayer.x;
            const dy = p.y - otherPlayer.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < p.radius + otherPlayer.radius) {
                // 충돌 발생! 데미지 적용
                const damage = p.damage;
                const finalDamage = otherPlayer.isShielded ? damage * (1 - otherPlayer.damageReduction) : damage;
                otherPlayer.health -= finalDamage;

                io.emit('playerHealthUpdate', { id: otherPlayer.id, health: otherPlayer.health });
                console.log(`${otherPlayer.nickname}(${otherPlayer.id})가 ${finalDamage.toFixed(0)} 데미지를 입었습니다. 남은 체력: ${otherPlayer.health.toFixed(0)}`);

                if (!p.piercing) { // 관통이 아닌 발사체는 충돌 시 제거
                    projectiles.splice(i, 1);
                    break; // 현재 발사체가 제거되었으므로 다음 발사체로
                }
            }
        }
    }

    // 모든 클라이언트에게 최신 게임 상태 전송
    io.emit('gameState', {
        players: players,
        projectiles: projectiles, // 서버에서 관리하는 발사체 목록
        meleeAttacks: meleeAttacksData, // 클라이언트에서 시각화할 근접 공격
        assassinStabs: assassinStabsData // 클라이언트에서 시각화할 암살자 공격
        // TODO: 몬스터, 아이템 등 다른 게임 오브젝트 추가
    });

    // 일회성 시각 효과 데이터는 전송 후 클라이언트에서 소모될 것이므로 서버에서는 계속 유지할 필요 없음
    // (클라이언트에서 duration 감소 처리)
    meleeAttacksData.length = 0; // 매 프레임 초기화
    assassinStabsData.length = 0; // 매 프레임 초기화

}, 1000 / 60); // 초당 60회 (약 16.67ms)

server.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`클라이언트 접속: http://localhost:${PORT}`);
});

// Canvas size for server-side calculations
const canvas = {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT
};