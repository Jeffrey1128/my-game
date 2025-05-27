const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 20,
  color: 'red',
  speed: 5,
};

function drawPlayer() {
  ctx.beginPath();
  ctx.fillStyle = player.color;
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.closePath();
}

function clear() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function update() {
  clear();
  drawPlayer();
  requestAnimationFrame(update);
}

window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowLeft':
      player.x -= player.speed;
      if (player.x - player.radius < 0) player.x = player.radius;
      break;
    case 'ArrowRight':
      player.x += player.speed;
      if (player.x + player.radius > canvas.width) player.x = canvas.width - player.radius;
      break;
    case 'ArrowUp':
      player.y -= player.speed;
      if (player.y - player.radius < 0) player.y = player.radius;
      break;
    case 'ArrowDown':
      player.y += player.speed;
      if (player.y + player.radius > canvas.height) player.y = canvas.height - player.radius;
      break;
  }
});

update();
