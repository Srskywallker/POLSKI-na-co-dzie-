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
| `index.html` | O app inteiro: HTML, CSS e JS num arquivo só (~11 MB). As seções do JS começam com `/* ===== NOME ===== */` |
| `conteudo/c-*.js` | Fonte das lições do curso (A1 módulos em diante). Editar aqui, nunca direto no index |
| `conteudo/curso-a1.js` | As 20 primeiras lições, já embutidas no index (seção `CURSO A1`). Guardado como referência |
| `audio/<id>.json` | Áudio de cada lição (`{texto: mp3 em base64}`), baixado só quando a lição abre |
| `ferramentas/montar.py` | Junta `conteudo/` no index (entre `/*CURSO_MAIS*/` e `/*CURSO_MAIS_FIM*/`) e grava o áudio que falta. Ver `ferramentas/README.md` |

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

- **Áudio antigo embutido:** o objeto `AUDIOS` no index tem ~11 MB de áudio das partes antigas. Dá para migrar para `audio/*.json` como as lições novas.
- **Arquivo único:** HTML, CSS e JS estão juntos; separar em módulos facilitaria a manutenção.
- **Id do cartão depende da posição no baralho:** mudar a ordem dos cartões embaralha o progresso salvo (localStorage) de quem já estuda. Trocar por um id estável (por exemplo, derivado do texto em polonês) com migração do progresso.
- **Revisão de nativo:** os textos das lições não foram revisados por um falante nativo, principalmente no B1 e no B2.
- **Plano futuro:** o README menciona uma versão para Android e iPhone com login.
