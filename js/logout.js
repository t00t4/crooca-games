document.addEventListener('DOMContentLoaded', () => {
    const sairButton = document.getElementById('sairButton');
    if (!sairButton) return;

    sairButton.addEventListener('click', () => {
        fetch('/logout', { method: 'POST', credentials: 'same-origin' })
            .finally(() => {
                window.location.href = 'login.html';
            });
    });
});
