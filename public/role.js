// public/role.js
document.addEventListener('DOMContentLoaded', () => {
    const nickname = localStorage.getItem('nickname');
    const welcomeMessageElement = document.getElementById('welcome-message');
    const roleButtons = document.querySelectorAll('.role-button');
    const startGameButton = document.getElementById('startGameButtonRole');

    let selectedRole = localStorage.getItem('playerRole') || 'melee'; // 기본값 또는 저장된 값 불러오기

    if (nickname) {
        welcomeMessageElement.textContent = `${nickname}님, 환영합니다!`;
    } else {
        welcomeMessageElement.textContent = '환영합니다!';
        // 닉네임이 없으면 인덱스 페이지로 돌려보낼 수도 있음
        // window.location.href = 'index.html';
    }

    // 역할 버튼 클릭 이벤트
    roleButtons.forEach(button => {
        if (button.dataset.role === selectedRole) {
            button.classList.add('selected');
        }
        button.addEventListener('click', () => {
            roleButtons.forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
            selectedRole = button.dataset.role;
        });
    });

    startGameButton.addEventListener('click', () => {
        localStorage.setItem('playerRole', selectedRole); // 역할군 저장
        window.location.href = 'game.html'; // 게임 페이지로 이동
    });
});