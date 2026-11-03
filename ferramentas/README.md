# Ferramentas

## Montar o curso e gravar o áudio

```
pip install piper-tts
python -m piper.download_voices --download-dir ferramentas/voz pl_PL-darkman-medium
python ferramentas/montar.py
```

Precisa também de **Node** e **ffmpeg** no PATH.

O script:

1. junta os arquivos de `conteudo/` no `index.html`, entre os marcadores `/*CURSO_MAIS*/` e `/*CURSO_MAIS_FIM*/`;
2. grava o áudio de cada palavra, diálogo e leitura com a voz Piper `pl_PL-darkman-medium` (masculina, velocidade 1.1);
3. salva um arquivo `audio/<id da lição>.json` por lição. O app baixa esse arquivo só quando a lição é aberta.

Áudio já gravado é reaproveitado. Rodar de novo sem mudar nada deixa tudo igual.

A voz (63 MB) e o cache de clipes (`ferramentas/.clips`) ficam fora do git.
