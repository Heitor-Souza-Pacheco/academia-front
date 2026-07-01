# Cranium — Front da Academia

Plataforma web (HTML/CSS/JS puro) para a academia **Cranium**. Tema vermelho / preto / branco.
Conversa com o backend Spring Boot que está em `../academia`.

## Funcionalidades

- **Login e cadastro** com token JWT salvo no navegador (você continua logado entre as visitas).
- **Fichas de treino** em cards, com busca por título e filtro por categoria.
- **Detalhe da ficha** em modal, com a lista de exercícios (séries × repetições) em ordem.
- **Salvar fichas no perfil** (aba "Salvos") — guardado por usuário no navegador.
- **Área de administração** (apenas para usuários `ADMIN`): criar, editar e excluir fichas, com exercícios dinâmicos.

## Como rodar

### 1. Suba o backend
Na pasta `C:\Users\01065831\Documents\academia`, rode a aplicação Spring Boot (porta **8080**) e garanta que o PostgreSQL esteja no ar.

> Já adicionei a configuração de **CORS** no backend (`SecurityConfig.java`) liberando origens locais — é necessário recompilar/reiniciar o backend para valer.

### 2. Suba o front
Dê **duplo clique em `start.bat`** (ou rode no terminal):

```powershell
py -m http.server 5500
```

Depois acesse: **http://localhost:5500**

> Importante: o site precisa ser servido por HTTP (o `start.bat` faz isso). Abrir o `index.html` direto com `file://` não funciona por causa dos módulos JavaScript.

### 3. Se o backend estiver em outra porta/host
Edite `js/config.js` e ajuste `API_BASE`.

## Como virar ADMIN (para gerenciar fichas)

O cadastro sempre cria usuários comuns (`USER`). Para liberar a aba **Gerenciar**, promova seu usuário a `ADMIN` direto no banco:

```sql
UPDATE tbl_user SET role = 'ADMIN' WHERE email = 'seu@email.com';
```

Depois **saia e entre de novo** no site (o papel vem dentro do token JWT).

## Estrutura

```
academia-front/
├── index.html          # marcação das telas (auth + app + modais)
├── start.bat           # sobe o servidor estático na porta 5500
├── css/
│   └── styles.css      # tema vermelho/preto/branco
└── js/
    ├── config.js       # URL base da API
    ├── session.js      # token JWT + usuário atual (decodifica o token)
    ├── favorites.js    # "salvos no perfil" (localStorage por usuário)
    ├── api.js          # cliente HTTP da API
    └── app.js          # lógica/telas/renderização
```
