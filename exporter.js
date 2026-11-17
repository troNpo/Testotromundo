// ==========================================
// EXPORTER.JS - Gestor Avanzado de Exportación (KML jerárquico, GPX mixto y Apertura Directa orux-track://)
// ==========================================

const RouteExporter = {
    init() {
        this.injectOruxOpenButton();
        this.setupEvents();
    },

    // Detección robusta de dispositivos móviles/tablets (Android, iOS, iPadOS)
    isMobileOrTablet() {
        const ua = (navigator.userAgent || navigator.vendor || window.opera || "").toLowerCase();
        const platform = (navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();

        const isAndroid = /android/.test(ua) || /android/.test(platform) || (/linux/.test(platform) && navigator.maxTouchPoints > 0);
        const isIOS = /iphone|ipad|ipod/.test(ua) || /iphone|ipad|ipod/.test(platform) || (platform === 'macintel' && navigator.maxTouchPoints > 1);
        const isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

        return isAndroid || isIOS || isCoarsePointer;
    },

    // Inyecta dinámicamente el botón "Abrir en OruxMaps" junto al botón de descarga en Android/iOS
    injectOruxOpenButton() {
        if (!this.isMobileOrTablet()) return;

        const btnDownload = document.getElementById("opt-btn-download-file");
        if (!btnDownload || document.getElementById("opt-btn-open-orux")) return;

        const parent = btnDownload.parentElement;
        if (!parent) return;

        const rowWrapper = document.createElement("div");
        rowWrapper.style.cssText = `
            display: flex;
            align-items: stretch;
            gap: 8px;
            width: 100%;
        `;

        parent.insertBefore(rowWrapper, btnDownload);

        btnDownload.style.flex = "1";
        btnDownload.style.minWidth = "0";
        rowWrapper.appendChild(btnDownload);

        const btnOrux = document.createElement("button");
        btnOrux.id = "opt-btn-open-orux";
        btnOrux.type = "button";
        btnOrux.title = "Abrir directamente en OruxMaps (orux-track://)";
        btnOrux.style.cssText = `
            flex: 1.2;
            min-width: 0;
            background: #000000;
            color: #ff3b30;
            border: 1.5px solid #ff3b30;
            border-radius: 10px;
            padding: 10px 8px;
            font-weight: bold;
            font-size: 0.8rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            box-shadow: 0 4px 12px rgba(255, 59, 48, 0.25);
            transition: transform 0.15s ease, background 0.15s ease;
        `;

        btnOrux.innerHTML = `
            <img src="ui-icons/logo_rojo.png" width="18" height="18" style="object-fit: contain; flex-shrink: 0;" alt="OruxMaps">
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Abrir en OruxMaps</span>
        `;

        rowWrapper.appendChild(btnOrux);
    },

    setupEvents() {
        document.querySelectorAll('input[name="export-format"]').forEach(radio => {
            radio.addEventListener("change", (e) => {
                const input = document.getElementById("export-filename-input");
                if (!input) return;
                let val = input.value.trim();
                const baseName = val.includes('.') ? val.substring(0, val.lastIndexOf('.')) : val;
                input.value = `${baseName}.${e.target.value}`;
            });
        });

        const btnDownload = document.getElementById("opt-btn-download-file");
        if (btnDownload) {
            btnDownload.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.executeExport(false);
            });
        }

        const btnOpenOrux = document.getElementById("opt-btn-open-orux");
        if (btnOpenOrux) {
            btnOpenOrux.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.executeExport(true);
            });
        }

        const detailsEl = document.getElementById("export-accordion");
        detailsEl?.addEventListener("toggle", () => {
            const arrow = document.getElementById("export-accordion-arrow");
            if (arrow) {
                arrow.style.transform = detailsEl.open ? "rotate(180deg)" : "rotate(0deg)";
            }
        });
    },

    getExportParams() {
        const planner = window.RoutePlanner || (typeof RoutePlanner !== 'undefined' ? RoutePlanner : null);

        if (!planner || (planner.points.length === 0 && !planner.currentRouteData)) {
            if (planner && typeof planner.showToast === 'function') {
                planner.showToast("No hay ruta ni puntos para exportar");
            } else {
                alert("⚠️ No hay ruta ni puntos para exportar");
            }
            return null;
        }

        let format = 'kml';
        document.querySelectorAll('input[name="export-format"]').forEach(r => {
            if (r.checked) format = r.value;
        });

        const inputNombre = document.getElementById("export-filename-input");
        let filename = inputNombre && inputNombre.value.trim() ? inputNombre.value.trim() : `otromundo_ruta.${format}`;
        if (!filename.endsWith(`.${format}`)) filename += `.${format}`;

        return { planner, format, filename };
    },

    async executeExport(openInOrux = false) {
        const params = this.getExportParams();
        if (!params) return;

        const { planner, format, filename } = params;
        
        // Generamos siempre el archivo íntegro de OtroMundo (con nombres de waypoints, colores y tramos mixtos)
        const content = format === 'kml'
            ? this.buildKmlHierarchical(filename, planner)
            : this.buildGpx(filename, planner);
        const mimeType = format === 'kml'
            ? 'application/vnd.google-earth.kml+xml'
            : 'application/gpx+xml';

        if (!openInOrux) {
            this.triggerBlobDownload(content, filename, mimeType);
            document.getElementById("side-panel-planner-options")?.classList.remove("active");
            return;
        }

        await this.openDirectInOruxMaps(content, filename, format, mimeType, planner);
    },

    async openDirectInOruxMaps(content, filename, format, mimeType, planner) {
        const btnOrux = document.getElementById("opt-btn-open-orux");
        const originalHTML = btnOrux ? btnOrux.innerHTML : "";

        if (btnOrux) {
            btnOrux.disabled = true;
            btnOrux.innerHTML = `<span>Enviando...</span>`;
        }
        if (planner && typeof planner.showToast === 'function') {
            planner.showToast(`Preparando ${filename} para OruxMaps...`);
        }

        try {
            // Alojamos el archivo exacto generado por OtroMundo (.kml o .gpx) en Litterbox (1h temporal)
            // Devuelve una URL directa https://litter.catbox.moe/xxxxxx.kml (o .gpx) terminada en la extensión real,
            // conservando al 100% los nombres de puntos, colores de tramos y segmentos rectos.
            const formData = new FormData();
            formData.append("reqtype", "fileupload");
            formData.append("time", "1h");
            const fileBlob = new Blob([content], { type: mimeType });
            formData.append("fileToUpload", fileBlob, filename);

            const response = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
                method: "POST",
                body: formData
            });

            if (!response.ok) throw new Error("Fallo al preparar el archivo temporal");

            const directHttpsUrl = (await response.text()).trim();
            if (!directHttpsUrl.startsWith("http")) {
                throw new Error("URL temporal no válida");
            }

            // Convertimos https://... -> orux-track://... para que OruxMaps lo descargue y abra en pantalla
            const oruxTrackDeepLink = directHttpsUrl.replace(/^https?:\/\//i, "orux-track://");

            document.getElementById("side-panel-planner-options")?.classList.remove("active");
            window.location.href = oruxTrackDeepLink;

        } catch (err) {
            console.warn("No se pudo generar el enlace temporal, descargando archivo local:", err);
            if (planner && typeof planner.showToast === 'function') {
                planner.showToast("Descargando archivo para abrir en OruxMaps...");
            }
            document.getElementById("side-panel-planner-options")?.classList.remove("active");
            this.triggerBlobDownload(content, filename, mimeType);
        } finally {
            if (btnOrux) {
                btnOrux.disabled = false;
                btnOrux.innerHTML = originalHTML;
            }
        }
    },

    hexToKmlColor(hex) {
        if (!hex || !hex.startsWith('#') || hex.length < 7) return 'ff00e5ff';
        const r = hex.substring(1, 3);
        const g = hex.substring(3, 5);
        const b = hex.substring(5, 7);
        return `ff${b}${g}${r}`;
    },

    buildKmlHierarchical(filename, planner) {
        let kml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        kml += `<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:om="http://www.oruxmaps.com/oruxmapsextensions/1/0" xmlns:gx="http://www.google.com/kml/ext/2.2">\n`;
        kml += `<Document>\n`;
        kml += `  <name><![CDATA[${filename.replace('.kml', '')}]]></name>\n`;

        // Carpeta 1: Waypoints
        if (planner.points && planner.points.length > 0) {
            kml += `  <Folder>\n`;
            kml += `    <name><![CDATA[Waypoints de Ruta]]></name>\n`;
            planner.points.forEach((p, idx) => {
                const puntoName = p.name || (`Punto ${idx + 1}`);
                kml += `    <Placemark>\n`;
                kml += `      <name><![CDATA[${puntoName}]]></name>\n`;
                kml += `      <Point>\n`;
                kml += `        <coordinates>${p.coords[0]},${p.coords[1]},${p.coords[2] || 0}</coordinates>\n`;
                kml += `      </Point>\n`;
                kml += `    </Placemark>\n`;
            });
            kml += `  </Folder>\n`;
        }

        // Carpeta 2: Traza mixta desglosada por Segmentos
        if (planner.segments && planner.segments.length > 0 && planner.points.length >= 2) {
            kml += `  <Folder>\n`;
            kml += `    <name><![CDATA[Traza de Ruta (Mixta)]]></name>\n`;

            planner.segments.forEach((seg, sIdx) => {
                const pStart = planner.points[sIdx]?.coords;
                const pEnd = planner.points[sIdx + 1]?.coords;
                if (!pStart || !pEnd) return;

                const isManual = seg.profile === "manual-straight";
                const subCoords = isManual 
                    ? [pStart, pEnd] 
                    : (seg.coordinates && seg.coordinates.length >= 2 ? seg.coordinates : [pStart, pEnd]);

                const segName = seg.name || `Tramo ${sIdx + 1} (${isManual ? 'Punto a punto' : 'BRouter'})`;
                const styleId = `seg_style_${sIdx}`;
                const kmlColor = this.hexToKmlColor(seg.color || '#00e5ff');

                kml += `    <Style id="${styleId}">\n`;
                kml += `      <LineStyle>\n`;
                kml += `        <color>${kmlColor}</color>\n`;
                kml += `        <width>4</width>\n`;
                kml += `      </LineStyle>\n`;
                kml += `    </Style>\n`;

                kml += `    <Placemark>\n`;
                kml += `      <name><![CDATA[${segName}]]></name>\n`;
                kml += `      <styleUrl>#${styleId}</styleUrl>\n`;
                kml += `      <LineString>\n`;
                kml += `        <tessellate>1</tessellate>\n`;
                kml += `        <coordinates>\n`;
                kml += `          `;
                kml += subCoords.map(c => `${c[0]},${c[1]},${c[2] || 0}`).join(" ");
                kml += `\n        </coordinates>\n`;
                kml += `      </LineString>\n`;
                kml += `    </Placemark>\n`;
            });

            kml += `  </Folder>\n`;
        }

        kml += `</Document>\n`;
        kml += `</kml>`;
        return kml;
    },

    buildGpx(filename, planner) {
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        gpx += `<gpx version="1.1" creator="Otromundo - PWA" xmlns="http://www.topografix.com/GPX/1/1" xmlns:om="http://www.oruxmaps.com/oruxmapsextensions/1/0">\n`;
        gpx += `  <metadata>\n`;
        gpx += `    <name><![CDATA[${filename.replace('.gpx', '')}]]></name>\n`;
        gpx += `    <time>${new Date().toISOString()}</time>\n`;
        gpx += `  </metadata>\n`;

        // Waypoints
        if (planner.points && planner.points.length > 0) {
            planner.points.forEach((p, idx) => {
                gpx += `  <wpt lat="${p.coords[1]}" lon="${p.coords[0]}">\n`;
                if (p.coords[2] !== undefined) gpx += `    <ele>${p.coords[2]}</ele>\n`;
                gpx += `    <name><![CDATA[${p.name || ('Punto ' + (idx + 1))}]]></name>\n`;
                gpx += `  </wpt>\n`;
            });
        }

        // Track unificado combinando todos los segmentos (BRouter y manuales)
        if (planner.segments && planner.segments.length > 0 && planner.points.length >= 2) {
            gpx += `  <trk>\n`;
            gpx += `    <name><![CDATA[${filename.replace('.gpx', '')}]]></name>\n`;
            gpx += `    <trkseg>\n`;

            planner.segments.forEach((seg, sIdx) => {
                const pStart = planner.points[sIdx]?.coords;
                const pEnd = planner.points[sIdx + 1]?.coords;
                if (!pStart || !pEnd) return;

                const isManual = seg.profile === "manual-straight";
                const subCoords = isManual 
                    ? [pStart, pEnd] 
                    : (seg.coordinates && seg.coordinates.length >= 2 ? seg.coordinates : [pStart, pEnd]);

                subCoords.forEach((c, cIdx) => {
                    if (sIdx > 0 && cIdx === 0) return;

                    gpx += `      <trkpt lat="${c[1]}" lon="${c[0]}">\n`;
                    if (c[2] !== undefined) gpx += `        <ele>${c[2]}</ele>\n`;
                    gpx += `      </trkpt>\n`;
                });
            });

            gpx += `    </trkseg>\n`;
            gpx += `  </trk>\n`;
        }

        gpx += `</gpx>`;
        return gpx;
    },

    triggerBlobDownload(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
};

document.addEventListener("DOMContentLoaded", () => {
    RouteExporter.init();
});
