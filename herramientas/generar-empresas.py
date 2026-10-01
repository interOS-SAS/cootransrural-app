#!/usr/bin/env python3
"""Genera las páginas de cada cooperativa a partir de plantillas/.

Cada archivo de plantillas/<ruta> se escribe, para cada ficha de empresas/*/ficha.json:
  - Cootransrural → en la raíz del sitio (<ruta>)
  - las demás     → en <id>/<ruta>

Marcas que entiende el generador (en HTML, JSON, etc.):
  {{RAIZ}}             ruta relativa a la raíz del sitio desde el archivo generado
  {{RAIZ_EMPRESA}}     ruta relativa a la raíz de la cooperativa
  {{clave.sub}}        valor de la ficha o del contexto (se escapa para HTML)
  {{{clave.sub}}}      valor sin escapar (solo para HTML/JSON armado aquí)
  {{#si clave}}…{{/si}}   bloque si el valor es verdadero
  {{#no clave}}…{{/no}}   bloque si el valor es falso o vacío

Después de generar, correr herramientas/versionar.py.
Uso:  python3 herramientas/generar-empresas.py
"""
import html
import json
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PLANTILLAS = RAIZ / 'plantillas'
PRINCIPAL = 'cootransrural'  # la que vive en la raíz del sitio
URL_PUBLICA = 'https://interos-sas.github.io/cootransrural-app/'

MARCA = re.compile(r'\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}')
BLOQUE = re.compile(r'\{\{#(si|no)\s+([\w.]+)\s*\}\}(.*?)\{\{/\1\}\}', re.S)


def fichas():
    salida = []
    for p in sorted((RAIZ / 'empresas').glob('*/ficha.json')):
        salida.append(json.loads(p.read_text(encoding='utf-8')))
    # La principal primero.
    salida.sort(key=lambda f: (f['id'] != PRINCIPAL, f['id']))
    return salida


def buscar(ctx, clave):
    valor = ctx
    for parte in clave.split('.'):
        if isinstance(valor, dict) and parte in valor:
            valor = valor[parte]
        else:
            return None
    return valor


def texto(valor):
    if valor is None:
        return ''
    if isinstance(valor, bool):
        return 'true' if valor else 'false'
    if isinstance(valor, (dict, list)):
        return json.dumps(valor, ensure_ascii=False)
    return str(valor)


def renderizar(plantilla, ctx):
    def bloque(m):
        tipo, clave, cuerpo = m.groups()
        v = buscar(ctx, clave)
        verdad = bool(v) and v not in ('false', '0')
        return renderizar(cuerpo, ctx) if (verdad if tipo == 'si' else not verdad) else ''

    anterior = None
    while anterior != plantilla:  # bloques anidados
        anterior = plantilla
        plantilla = BLOQUE.sub(bloque, plantilla)

    def marca(m):
        crudo, normal = m.groups()
        if crudo:
            return texto(buscar(ctx, crudo))
        return html.escape(texto(buscar(ctx, normal)), quote=True)

    return MARCA.sub(marca, plantilla)


def contexto(ficha, destino_rel):
    """Datos disponibles en las plantillas para un archivo generado."""
    profundidad = len(pathlib.PurePosixPath(destino_rel).parts) - 1
    raiz = '../' * profundidad or './'
    es_principal = ficha['id'] == PRINCIPAL
    prefijo = '' if es_principal else f"{ficha['id']}/"
    # Ruta relativa desde el archivo hasta la raíz de la cooperativa.
    partes_empresa = len(pathlib.PurePosixPath(prefijo).parts) if prefijo else 0
    raiz_empresa = '../' * (profundidad - partes_empresa) or './'
    E = ficha['EMPRESA']
    ctx = dict(ficha)
    ctx.update({
        'RAIZ': raiz,
        'RAIZ_EMPRESA': raiz_empresa,
        'id': ficha['id'],
        'es_principal': es_principal,
        'es_propuesta': ficha.get('estado') == 'propuesta',
        'es_cliente': ficha.get('estado') != 'propuesta',
        'url_publica': URL_PUBLICA + prefijo,
        'url_sitio': URL_PUBLICA,
        'proveedor': {'nombre': 'interOS', 'web': 'https://interos.com.co'},
        'tiene_telefono': bool(E.get('telefono')),
        'tiene_whatsapp': bool(E.get('whatsapp')),
        'tiene_correo': bool(E.get('correo')),
        'cooperativas': [{'id': f['id'], 'nombre': f['EMPRESA']['nombre'], 'pueblo': f['EMPRESA']['pueblo'], 'estado': f.get('estado'),
                          'ruta': '' if f['id'] == PRINCIPAL else f"{f['id']}/"} for f in fichas()],
    })
    return ctx


def generar():
    escritos = 0
    lista = fichas()
    for plantilla in sorted(PLANTILLAS.rglob('*')):
        if not plantilla.is_file():
            continue
        rel = plantilla.relative_to(PLANTILLAS).as_posix()
        fuente = plantilla.read_text(encoding='utf-8')
        # Plantillas que solo aplican a la raíz (por ejemplo, el índice de cooperativas).
        solo_raiz = rel.startswith('_raiz/')
        for ficha in lista:
            if solo_raiz and ficha['id'] != PRINCIPAL:
                continue
            destino_rel = rel[len('_raiz/'):] if solo_raiz else (rel if ficha['id'] == PRINCIPAL else f"{ficha['id']}/{rel}")
            salida = renderizar(fuente, contexto(ficha, destino_rel))
            destino = RAIZ / destino_rel
            destino.parent.mkdir(parents=True, exist_ok=True)
            if not destino.exists() or destino.read_text(encoding='utf-8') != salida:
                destino.write_text(salida, encoding='utf-8')
                escritos += 1
                print('generado:', destino_rel)
    print(f'{escritos} archivo(s) escritos para {len(lista)} cooperativa(s)')


if __name__ == '__main__':
    generar()
