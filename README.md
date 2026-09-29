# Terra Tupi · Cardápio Digital

Aplicação sem dependências externas, executada com Node.js 18 ou superior.

## Executar no Windows

No PowerShell, a partir desta pasta:

```powershell
$env:ADMIN_PASSWORD = 'defina-uma-senha-forte-com-ao-menos-12-caracteres'
node .\server.js
```

Abra `http://localhost:3000` para o cardápio ou `http://localhost:3000/admin` para entrar no painel do restaurante.

O Live Server continua servindo a versão estática do cardápio, mas não fornece login, salvamento nem upload. Para usar o painel, inicie `server.js` e acesse a porta 3000.

## Persistência e publicação

O cardápio editado e as fotos ficam em `data/`. Configure `DATA_DIR` para apontar a uma pasta persistente ao hospedar a aplicação. Defina sempre `ADMIN_PASSWORD` com uma senha forte. Em hospedagem atrás de proxy HTTPS, configure também `SESSION_SECRET` como segredo aleatório persistente.
