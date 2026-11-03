"""Junta as lições de conteudo/ no index.html e grava o áudio de cada lição em audio/<id>.json.

Uso (na raiz do repositório):
    python ferramentas/montar.py

Precisa de: Node, ffmpeg e `pip install piper-tts`.
A voz fica em ferramentas/voz/ (veja ferramentas/README.md). Áudios já gravados são reaproveitados.
"""
import base64, glob, hashlib, json, os, subprocess, sys, tempfile, wave

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(RAIZ, 'index.html')
VOZ = os.environ.get('PIPER_VOZ', os.path.join(RAIZ, 'ferramentas', 'voz', 'pl_PL-darkman-medium.onnx'))
CLIPS = os.path.join(RAIZ, 'ferramentas', '.clips')  # cache local, fora do git

# ordem dos arquivos = ordem das partes no app (curso-a1.js já está embutido no index e não entra aqui)
ARQUIVOS = ['c-a1m-1.js', 'c-a1m-2.js', 'c-a1m-3.js', 'c-a1m-4.js', 'c-a1b.js', 'c-a1p.js',
            'c-a2z-1.js', 'c-a2z-2.js', 'c-a2z-3.js', 'c-a2b.js', 'c-b1.js', 'c-b2.js']
arquivos = [os.path.join(RAIZ, 'conteudo', f) for f in (sys.argv[1:] or ARQUIVOS)]
js = ''.join(open(f, encoding='utf-8').read() + '\n' for f in arquivos)

# 1. insere o conteúdo entre os marcadores do index.html
s = open(INDEX, encoding='utf-8').read()
ini, fim = '/*CURSO_MAIS*/', '/*CURSO_MAIS_FIM*/'
a, b = s.index(ini) + len(ini), s.index(fim)
s = s[:a] + '\n' + js + s[b:]
open(INDEX, 'w', encoding='utf-8').write(s)

# 2. extrai os textos que precisam de áudio
tmp = tempfile.mkdtemp()
saida = os.path.join(tmp, 'c.json').replace('\\', '/')
script = os.path.join(tmp, 'c.js')
open(script, 'w', encoding='utf-8').write('const CURSO=[];\n' + js + f'\nrequire("fs").writeFileSync("{saida}", JSON.stringify(CURSO.map(l=>({{id:l.id, t:[...l.pal.map(p=>p[0]), ...(l.dial||[]).map(d=>d[0]), ...(l.texto?[l.texto]:[])]}}))));')
subprocess.run(['node', script], check=True)
licoes = json.load(open(saida, encoding='utf-8'))

# 3. grava o áudio que falta
os.makedirs(os.path.join(RAIZ, 'audio'), exist_ok=True)
os.makedirs(CLIPS, exist_ok=True)
voz = None
for l in licoes:
    out = os.path.join(RAIZ, 'audio', l['id'] + '.json')
    antigo = json.load(open(out, encoding='utf-8')) if os.path.exists(out) else {}
    m = {}
    for t in l['t']:
        if t in antigo:
            m[t] = antigo[t]; continue
        h = hashlib.md5(t.encode()).hexdigest()[:12]
        wav, mp3 = os.path.join(CLIPS, h + '.wav'), os.path.join(CLIPS, h + '.mp3')
        if not os.path.exists(mp3):
            if voz is None:
                from piper import PiperVoice, SynthesisConfig
                voz, cfg = PiperVoice.load(VOZ), SynthesisConfig(length_scale=1.1)
            fala = t.replace(' / ', ', ').replace('…', '').replace('(', '').replace(')', '')
            with wave.open(wav, 'wb') as wf:
                voz.synthesize_wav(fala, wf, syn_config=cfg)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '22050', '-b:a', '40k', mp3], check=True)
        m[t] = base64.b64encode(open(mp3, 'rb').read()).decode()
    json.dump(m, open(out, 'w', encoding='utf-8'), ensure_ascii=False)

mb = sum(os.path.getsize(x) for x in glob.glob(os.path.join(RAIZ, 'audio', '*.json'))) / 1e6
print(f'{len(licoes)} lições externas; {mb:.1f} MB de áudio; index {len(s.encode()) / 1e6:.1f} MB')
