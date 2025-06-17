<!DOCTYPE html>
<html lang="ko>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>내 게임</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <h1>환영합니다!</h1>
        <p>게임에 참여할 닉네임을 입력해주세요.</p>
        <input type="text" id="nicknameInput" placeholder="닉네임 입력" maxlength="12">
        <button id="startGameButton">게임 시작</button>
    </div>
    <script src="/socket.io/socket.io.js"></script>
    <script src="index.js"></script>
</body>
</html>