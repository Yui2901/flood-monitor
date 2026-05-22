if (localStorage.getItem('token')) {
  window.location.href = 'dashboard.html';
}

document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  const msgErro = document.getElementById('msg-erro');
  msgErro.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('email').value,
        senha: document.getElementById('senha').value
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.erro || 'Credenciais inválidas');
    localStorage.setItem('token', json.token);
    localStorage.setItem('adm', JSON.stringify(json.adm));
    window.location.href = 'dashboard.html';
  } catch (err) {
    msgErro.textContent = err.message;
    msgErro.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});
