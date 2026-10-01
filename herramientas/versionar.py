#!/usr/bin/env python3
"""Pone ?v=<huella> a los CSS y JS que cargan las páginas, para que el
navegador pida el archivo nuevo apenas cambie (GitHub Pages lo guarda 10 min).

Correr antes de cada commit:  python3 herramientas/versionar.py
"""
import hashlib
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
OMITIR = {'pruebas', 'node_modules', '.git', 'herramientas'}
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

for pagina in paginas():
    texto = pagina.read_text(encoding='utf-8')

    def poner(m):
        destino = (pagina.parent / m.group(2)).resolve()
        if not destino.is_file():
            return m.group(0)
        return f'{m.group(1)}="{m.group(2)}?v={huella(destino)}"'

    nuevo = REF.sub(poner, texto)
    nuevo = re.sub(r"const VERSION_DISENOS = '[0-9a-f]*';", f"const VERSION_DISENOS = '{version_disenos}';", nuevo)
    if nuevo != texto:
        pagina.write_text(nuevo, encoding='utf-8')
        cambiadas += 1
        print('versionada:', pagina.relative_to(RAIZ))

print(f'{cambiadas} página(s) actualizada(s); diseños {version_disenos}')
