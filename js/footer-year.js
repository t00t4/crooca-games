document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('footerYear');
    if (el) el.textContent = String(new Date().getFullYear());
});
