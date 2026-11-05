# POLSKI na co dzień

App gratuito, em português, para brasileiros aprenderem polonês do zero ao B2, com foco na vida diária e na entrevista da Karta Polaka.
Publicado pelo GitHub Pages a partir da branch `main`: https://srskywallker.github.io/POLSKI-na-co-dzie-/

## Regras de conteúdo

- **O app é público e genérico.** Nada de dados pessoais ou de família de quem desenvolve. Exemplos usam personagens fictícios (Lucas Kovalski, Curitiba, Płock).
- **Os livros são base de dados, não texto para copiar.** Use os temas, a sequência e a gramática dos livros oficiais de polonês como língua estrangeira, mas escreva textos e exercícios próprios. Não republicar livros nem trechos longos.
- **Fora do app:** o livro *Basic Polish: A Grammar and Workbook* (Routledge, com direitos autorais) e as faixas mp3 originais dos CDs.
- Interface e explicações em **português do Brasil**. Polonês sempre com os diacríticos certos (ą ć ę ł ń ó ś ź ż).
- Pronúncia escrita no estilo do app: sílaba tônica em maiúsculas, aproximação para quem fala português (`dzień dobry` → `djenh DÓ-brê`).
- Identidade visual "Cores da Polônia": vermelho `#DC143C`, fundo `#f7f7f7`, rodapé vinho `#8c0f29`, Helvetica.

## Estrutura

| Caminho | O que é |
|---|---|
| `index.html` | Só o HTML da casca (cabeçalho, abas) e os `<script>`/`<link>` |
| `estilo.css` | Todo o CSS |
| `dados.js` | Conteúdo: temas e cartões (`DECKS`), situações, entrevista, curso. As seções começam com `/* ===== NOME ===== */` |
| `app.js` | Lógica do app (estado, jornada, áudio, abas). Carregado depois de `dados.js`, no mesmo escopo global |
| `conteudo/c-*.js` | Fonte das lições do curso (A1 módulos em diante). Editar aqui, nunca direto no `dados.js` |
| `conteudo/curso-a1.js` | As 20 primeiras lições, já embutidas no `dados.js` (seção `CURSO A1`). Guardado como referência |
| `audio/<id>.json` | Áudio de cada lição (`{texto: mp3 em base64}`), baixado só quando a lição abre |
| `audio/base-NN.json` | Áudio das partes antigas (temas, situações, entrevista), em pedaços de ~400 KB. `AUDIO_BASE` no `dados.js` diz em qual pedaço está cada texto |
| `ferramentas/montar.py` | Junta `conteudo/` no `dados.js` (entre `/*CURSO_MAIS*/` e `/*CURSO_MAIS_FIM*/`), grava o áudio que falta e atualiza a versão do cache no `sw.js`. Ver `ferramentas/README.md` |
| `sw.js`, `manifest.json`, `icones/` | PWA. Código vem da rede primeiro; áudio e ícones, do cache |
| `android/` | App Android (TWA do Bubblewrap). A chave `android.keystore` e os `.apk`/`.aab` ficam fora do git |

### Progresso salvo

- Tudo fica no `localStorage` (chave `polski-na-co-dzien-v1`), no objeto `E`.
- Id do cartão = tema + polonês normalizado (`idCard`, por exemplo `cump:dzień dobry`). Reordenar ou inserir cartões não afeta o progresso. Corrigir o polonês de um cartão zera o progresso só daquele cartão.
- `migrarCards` converte o formato antigo (`tema-posição`, antes da v1.1) uma vez e marca `E.idsV = 2`. Não remover: ainda há quem não abriu o app depois da v1.1.

### Formato de uma lição

```js
CURSO.push({nivel: "A2", parte: "Módulo 5 · Comida", fonte: "Livro de base", audioExt: true,
  id: "a2z-5b", pt: "Quanto custa?", pl: "Ile to kosztuje?", obj: "Objetivo em uma frase.",
  gram: [["Título", "Explicação em português com exemplos em polonês."]],
  pal: [["polonês", "português", "pro-NÚN-cia", "nota opcional"]],
  dial: [["fala em polonês", "tradução"]],
  texto: "leitura opcional", textoPt: "tradução da leitura",
  ex: [{enun: "Enunciado", ops: ["certa", "errada", "errada"], ok: 0, expl: "opcional"},
       {enun: "Escreva: …", tipo: "txt", aceitas: ["resposta sem acentos"], resp: "Resposta."}]});
```

- `id` único; prefixo pelo livro (`a1m`, `a1b`, `a1p`, `a2z`, `a2b`, `b1b`, `b2b`).
- As opções são embaralhadas no carregamento, então a certa pode ficar em primeiro no conteúdo.
- `aceitas` é comparado sem acentos e sem pontuação.
- Cada palavra de `pal` vira cartão; palavras que já existem em outro baralho são reaproveitadas.
- Níveis em `NIVEIS` (A1, A2, B1, B2). Um nível abre com 70% das lições do anterior feitas com nota ≥ 70%.

## Fluxo de trabalho

1. Editar ou criar a lição em `conteudo/` (arquivo novo precisa entrar na lista `ARQUIVOS` de `montar.py`).
2. `python ferramentas/montar.py`
3. Testar servindo por HTTP (o áudio usa `fetch`, que falha em `file://`): `python -m http.server 8765` e abrir `http://localhost:8765`.
4. Conferir o console: o código tem `console.assert` para ids repetidos, palavras sem cartão e exercícios inválidos.
5. Commit e push em `main` publica no GitHub Pages.

## Dívidas conhecidas

- **Progresso só no aparelho:** `conectarNuvem` só funciona dentro do claude.ai. No site e nos apps não há login nem sincronização (plano da v2.0).
- **Revisão de nativo:** os textos das lições não foram revisados por um falante nativo, principalmente no B1 e no B2.
- **Plano futuro:** o README menciona uma versão para Android e iPhone com login.
