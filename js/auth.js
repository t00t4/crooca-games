document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (signupForm) signupForm.addEventListener('submit', handleSignUp);
});

function showMessage(form, text, isError) {
    let el = form.querySelector('.form__message');
    if (!el) {
        el = document.createElement('p');
        el.className = 'form__message';
        form.appendChild(el);
    }
    el.textContent = text;
    el.classList.toggle('form__message--error', Boolean(isError));
    el.classList.toggle('form__message--ok', !isError);
}

function setSubmitting(form, submitting) {
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = submitting;
}

async function handleLogin(event) {
    event.preventDefault();
    const form = event.target;
    const username = form.username.value;
    const password = form.password.value;

    setSubmitting(form, true);
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ username, password }),
        });
        const text = await response.text();

        if (response.ok) {
            window.location.href = 'index.html';
        } else {
            showMessage(form, text || 'Não foi possível entrar.', true);
        }
    } catch {
        showMessage(form, 'Erro de conexão. Tente novamente.', true);
    } finally {
        setSubmitting(form, false);
    }
}

async function handleSignUp(event) {
    event.preventDefault();
    const form = event.target;
    const username = form.username.value;
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;

    if (password !== confirmPassword) {
        showMessage(form, 'As senhas não coincidem.', true);
        return;
    }

    setSubmitting(form, true);
    try {
        const response = await fetch('/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ username, password }),
        });
        const text = await response.text();

        if (response.ok) {
            showMessage(form, 'Conta criada! Redirecionando…', false);
            setTimeout(() => { window.location.href = 'login.html'; }, 800);
        } else {
            showMessage(form, text || 'Não foi possível cadastrar.', true);
        }
    } catch {
        showMessage(form, 'Erro de conexão. Tente novamente.', true);
    } finally {
        setSubmitting(form, false);
    }
}
