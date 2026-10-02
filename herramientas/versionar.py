#!/usr/bin/env python3
"""Pone ?v=<huella> a los CSS y JS que cargan las páginas, para que el
navegador pida el archivo nuevo apenas cambie (GitHub Pages lo guarda 10 min).

También pone en cada página con módulos un mapa de importaciones (importmap) que
lleva cada módulo a su ?v=<huella>: así las importaciones internas
(«../nucleo/index.js», «./qr.js»…) también piden la versión nueva. Sin esto, el
servidor de taxicun.com y Cloudflare guardan 4 h la copia vieja de esos módulos.

Correr antes de cada commit:  python3 herramientas/versionar.py
"""
import hashlib
import json
import os
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
OMITIR = {'pruebas', 'node_modules', '.git', 'herramientas', 'plantillas'}
REF = re.compile(r'(href|src)="([^"#:?]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"')


def huella(*rutas):
    h = hashlib.sha1()
    for r in rutas:
        h.update(r.read_bytes())
    return h.hexdigest()[:10]


def paginas():
    for p in RAIZ.rglob('*.html'):
        if not OMITIR.intersection(p.relative_to(RAIZ).parts):
            yield p


cambiadas = 0
# Huella de los diseños y del núcleo (para las importaciones dinámicas de app/ y conductor/).
archivos_disenos = sorted(
    [*RAIZ.glob('disenos/[abc]/**/*.js'), *RAIZ.glob('disenos/[abc]/**/*.css'), *RAIZ.glob('nucleo/*.js')]
)
version_disenos = huella(*archivos_disenos)

# Todos los módulos que pueden cargar las páginas, con su huella.
MODULOS = {m: huella(m) for d in ('nucleo', 'disenos', 'web', 'vendor') for m in sorted((RAIZ / d).rglob('*.js'))}
MAPA = re.compile(r'[ \t]*<script type="importmap">.*?</script>\n?', re.S)


def mapa_de(pagina):
    imports = {}
    for m, h in MODULOS.items():
        rel = os.path.relpath(m, pagina.parent).replace(os.sep, '/')
        rel = rel if rel.startswith('.') else f'./{rel}'
        imports[rel] = f'{rel}?v={h}'
    return '<script type="importmap">' + json.dumps({'imports': imports}, separators=(',', ':')) + '</script>'


def con_mapa(texto, pagina):
    texto = MAPA.sub('', texto)
    if 'type="module"' not in texto and 'import(' not in texto:
        return texto
    # El mapa tiene que ir antes de cualquier módulo: se pone antes del primer <script>.
    m = re.search(r'([ \t]*)<script', texto)
    if not m:
        return texto
    return f'{texto[:m.start()]}{m.group(1)}{mapa_de(pagina)}\n{texto[m.start():]}'


for pagina in paginas():
    texto = pagina.read_text(encoding='utf-8')

    def poner(m):
        destino = (pagina.parent / m.group(2)).resolve()
        if not destino.is_file():
            return m.group(0)
        return f'{m.group(1)}="{m.group(2)}?v={huella(destino)}"'

    nuevo = REF.sub(poner, texto)
    nuevo = con_mapa(nuevo, pagina)
    nuevo = re.sub(r"const VERSION_DISENOS = '[0-9a-f]*';", f"const VERSION_DISENOS = '{version_disenos}';", nuevo)
    if nuevo != texto:
        pagina.write_text(nuevo, encoding='utf-8')
        cambiadas += 1
        print('versionada:', pagina.relative_to(RAIZ))

print(f'{cambiadas} página(s) actualizada(s); diseños {version_disenos}')
