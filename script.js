let S = JSON.parse(document.getElementById('data').textContent);
let admin = false;
let dirty = false;
let uid = Date.now();

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>\"]/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '\"': '&quot;'
}[c]));
const money = p => Number(p || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});
const toast = m => {
  const t = document.getElementById('toast');
  t.textContent = m;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 2600);
};

function view() {
  return `<header class="hero"><small>${esc(S.tag)}</small><h1 class="logo" role="img" aria-label="Terra Tupi"></h1><p>Cardápio</p><div class="orn">✦</div></header>
<nav>${S.cats.map(c => `<a href="#${c.id}">${esc(c.name)}</a>`).join('')}</nav>
<main>${S.cats.map(c => `<section id="${c.id}"><h2>${esc(c.name)}</h2>${c.items.map(i => `<article class="it ${i.off ? 'off' : ''}">${i.img ? `<img src="${i.img}" alt="${esc(i.n)}">` : ''}<div><h3>${esc(i.n)}${i.v ? '<span class="tag">Vegano</span>' : ''}</h3><p>${esc(i.d)}${i.off ? ' · <i>Indisponível hoje</i>' : ''}</p></div><b>${money(i.p)}</b></article>`).join('')}</section>`).join('')}</main>
<footer>Av. Santos Dumont, 610 · Atalaia, Aracaju – SE</footer>`;
}

function editor() {
  return `<header class="hero" style="padding-bottom:0"><h1 style="font-size:38px">Painel de edição</h1><p>Altere nomes, descrições, preços e fotos. Depois clique em “Publicar”.</p></header>
<main>${S.cats.map((c, ci) => `<div class="ch" data-c="${ci}"><input data-k="cn" value="${esc(c.name)}"><button class="r" data-act="delcat">Excluir</button></div>
${c.items.map((i, ii) => `<div class="ed" data-c="${ci}" data-i="${ii}"><label class="ph">${i.img ? `<img src="${i.img}">` : '+ Foto'}<input type="file" accept="image/*" hidden data-act="img"></label>
<div class="f"><input data-k="n" value="${esc(i.n)}" placeholder="Nome do prato"><textarea data-k="d" placeholder="Descrição">${esc(i.d)}</textarea>
<div class="row"><label>R$ <input type="number" step="0.01" min="0" data-k="p" value="${i.p}"></label><label><input type="checkbox" data-k="v" ${i.v ? 'checked' : ''}>Vegano</label><label><input type="checkbox" data-k="off" ${i.off ? 'checked' : ''}>Esgotado</label></div>
<div class="row">${i.img ? '<button class="g" data-act="rmimg">Remover foto</button>' : ''}<button class="r" data-act="del">Excluir prato</button></div></div></div>`).join('')}
<button class="g" data-act="add" data-c="${ci}">+ Novo prato em ${esc(c.name)}</button>`).join('')}
<p><button class="g" data-act="addcat">+ Nova categoria</button></p></main>
<div class="bar"><button data-act="save">Publicar alterações</button><button class="g" data-act="off">Sair da edição</button><span style="font-size:13px;color:var(--mut)">${dirty ? '● alterações não publicadas' : ''}</span></div>`;
}

function render() {
  const scrollPosition = window.scrollY;
  app.innerHTML = admin ? editor() : view();
  window.scrollTo(0, scrollPosition);
}

const find = el => {
  const w = el.closest('[data-c]');
  if (!w) return [];

  const c = S.cats[+w.dataset.c];
  return [c, w.dataset.i != null ? c.items[+w.dataset.i] : null, w];
};

document.addEventListener('input', ev => {
  const t = ev.target;
  const k = t.dataset.k;
  if (!k) return;

  const [c, i] = find(t);
  if (k === 'cn') {
    c.name = t.value;
  } else if (i) {
    i[k] = (k === 'v' || k === 'off')
      ? t.checked
      : (k === 'p' ? parseFloat(t.value) || 0 : t.value);
  }

  dirty = true;
});

document.addEventListener('click', async ev => {
  const b = ev.target.closest('button[data-act]');
  if (!b) return;

  const a = b.dataset.act;
  const [c, i] = find(b);

  if (a === 'on') {
    admin = true;
    render();
  } else if (a === 'off') {
    if (dirty && !confirm('Sair sem publicar? As alterações serão perdidas.')) return;
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    location.href = '/';
  } else if (a === 'add') {
    c.items.push({ id: 'i' + (uid++), n: 'Novo prato', d: '', p: 0, img: '', v: false, off: false });
    dirty = true;
    render();
  } else if (a === 'addcat') {
    S.cats.push({ id: 'c' + (uid++), name: 'Nova categoria', items: [] });
    dirty = true;
    render();
  } else if (a === 'del') {
    if (confirm('Excluir este prato?')) {
      c.items.splice(c.items.indexOf(i), 1);
      dirty = true;
      render();
    }
  } else if (a === 'delcat') {
    if (confirm('Excluir a categoria e todos os pratos dela?')) {
      S.cats.splice(S.cats.indexOf(c), 1);
      dirty = true;
      render();
    }
  } else if (a === 'rmimg') {
    i.img = '';
    dirty = true;
    render();
  } else if (a === 'save') {
    save();
  }
});

document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.dataset.act !== 'img' || !t.files[0]) return;

  const [, i] = find(t);
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, 900 / Math.max(im.width, im.height));
      const cv = document.createElement('canvas');
      cv.width = im.width * s;
      cv.height = im.height * s;
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      cv.toBlob(async blob => {
        try {
          toast('Enviando foto…');
          const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'image/jpeg' },
            body: blob
          });
          if (!response.ok) throw new Error('upload failed');
          i.img = (await response.json()).url;
          dirty = true;
          render();
        } catch (error) {
          toast('Falha ao enviar a foto.');
        }
      }, 'image/jpeg', .82);
    };
    im.src = r.result;
  };
  r.readAsDataURL(t.files[0]);
});

function login() {
  app.innerHTML = `<header class="hero"><h1 class="logo" role="img" aria-label="Terra Tupi"></h1><p>Acesso do restaurante</p></header>
<main class="login"><form id="login-form"><label for="password">Senha</label><div class="password-field"><input id="password" type="password" autocomplete="current-password" required><button class="password-toggle" type="button" aria-label="Mostrar senha" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="M3 3 21 21"/></svg></button></div><button type="submit">Entrar</button><p id="login-error" role="alert"></p></form></main>`;

  const password = document.getElementById('password');
  const toggle = document.querySelector('.password-toggle');
  toggle.addEventListener('click', () => {
    const isVisible = password.type === 'password';
    password.type = isVisible ? 'text' : 'password';
    toggle.setAttribute('aria-label', isVisible ? 'Ocultar senha' : 'Mostrar senha');
    toggle.setAttribute('aria-pressed', String(isVisible));
  });

  document.getElementById('login-form').addEventListener('submit', async event => {
    event.preventDefault();

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: document.getElementById('password').value })
      });
      if (!response.ok) {
        document.getElementById('login-error').textContent = 'Senha incorreta.';
        return;
      }

      admin = true;
      render();
    } catch (error) {
      document.getElementById('login-error').textContent = 'Não foi possível conectar ao servidor.';
    }
  });
}

async function save() {
  try {
    toast('Publicando…');
    const response = await fetch('/api/menu', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(S)
    });
    if (response.status === 401) {
      toast('Sessão expirada. Entre novamente.');
      setTimeout(login, 1500);
      return;
    }
    if (!response.ok) throw new Error('save failed');

    dirty = false;
    const status = document.querySelector('.bar span');
    if (status) status.textContent = '';
    toast('Cardápio atualizado.');
  } catch (error) {
    toast('Erro ao salvar. Tente de novo.');
  }
}

(async () => {
  for (const endpoint of ['/api/menu', '/default-menu.json']) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        S = await response.json();
        break;
      }
    } catch (error) {}
  }

  if (/^\/admin\/?$/.test(location.pathname)) {
    try {
      const response = await fetch('/api/me');
      if (response.ok) {
        admin = true;
        render();
      } else {
        login();
      }
    } catch (error) {
      login();
    }
  } else {
    render();
  }
})();