// Protección básica del contenido de TaxiCun: marca de agua sobre capturas y fotos, y sin
// clic derecho ni arrastre sobre las imágenes. No impide una captura de pantalla; deja claro
// de quién es el contenido (ver /terminos/#propiedad).
(() => {
  const MARCA = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='120'%3E%3Ctext x='10' y='70' transform='rotate(-24 110 60)' font-family='Arial' font-weight='700' font-size='18' fill='%23ffffff' fill-opacity='.28' stroke='%230B1530' stroke-opacity='.10' stroke-width='.6'%3E%C2%A9 TaxiCun · interOS%3C/text%3E%3C/svg%3E\")";
  const estilo = document.createElement('style');
  estilo.textContent = `.marca-agua{position:relative;display:inline-block}.marca-agua>.capa-marca{position:absolute;inset:0;pointer-events:none;background:${MARCA} repeat;border-radius:inherit;z-index:2}
img{-webkit-user-drag:none;user-select:none;-webkit-touch-callout:none}`;
  document.head.append(estilo);
  const marcar = () => {
    for (const img of document.querySelectorAll('img')) {
      if (img.dataset.marcada || img.closest('a.tienda, .pie, footer, header, nav') || /logo|icono|insignia|favicon|tiendas\//i.test(img.src)) continue;
      const w = img.naturalWidth || img.width;
      if (w && w < 200) continue;
      img.dataset.marcada = '1';
      const padre = img.parentElement;
      if (!padre) continue;
      if (getComputedStyle(padre).position === 'static') padre.style.position = 'relative';
      const capa = document.createElement('span');
      capa.className = 'capa-marca';
      capa.setAttribute('aria-hidden', 'true');
      capa.style.cssText = `position:absolute;inset:0;pointer-events:none;background:${MARCA} repeat;border-radius:inherit;z-index:2`;
      padre.append(capa);
    }
  };
  addEventListener('contextmenu', (e) => { if (e.target.closest('img, .capa-marca, picture, video')) e.preventDefault(); });
  addEventListener('dragstart', (e) => { if (e.target.tagName === 'IMG') e.preventDefault(); });
  if (document.readyState === 'complete') marcar(); else addEventListener('load', marcar);
})();
