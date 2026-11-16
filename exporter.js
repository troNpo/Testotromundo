// ==========================================
// EXPORTER.JS - Gestor Avanzado de Exportación (KML jerárquico, GPX mixto y Apertura Directa orux-track://)
// ==========================================

const RouteExporter = {
    init() {
        this.injectOruxOpenButton();
        this.setupEvents();
    },

    // Detecta si el dispositivo es Android o iOS (incluyendo iPadOS moderno)
    isMobileOS() {
        const ua = navigator.userAgent || navigator.vendor || window.opera || "";
        const isAndroid = /android/i.test(ua);
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        return isAndroid || isIOS;
    },

    // Inyecta dinámicamente el botón "Abrir en OruxMaps" junto al botón de descarga en Android/iOS
    injectOruxOpenButton() {
        if (!this.isMobileOS()) return;

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
            flex: 1.15;
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

        // 1. Comprobar si todos los tramos usan el mismo perfil BRouter (sin tramos rectos manuales)
        // En ese caso podemos pasar directamente la URL oficial de BRouter con format=gpx o format=kml,
        // que OruxMaps (tanto Android como iOS) entiende de forma nativa sin intermediarios.
        const firstProfile = planner.segments?.[0]?.profile || planner.profile;
        const allSameBRouter = planner.points.length >= 2 &&
            firstProfile !== "manual-straight" &&
            planner.segments.every(s => s.profile === firstProfile);

        if (allSameBRouter) {
            const lonlatsStr = planner.points.map(p => `${p.coords[0]},${p.coords[1]}`).join('|');
            const brouterFormat = format === 'kml' ? 'kml' : 'gpx';
            const brouterOruxUrl = `orux-track://brouter.de/brouter?lonlats=${lonlatsStr}&profile=${firstProfile}&alternativeidx=${planner.currentRouteIndex || 0}&format=${brouterFormat}`;

            if (planner && typeof planner.showToast === 'function') {
                planner.showToast(`Abriendo ${brouterFormat.toUpperCase()} en OruxMaps...`);
            }
            document.getElementById("side-panel-planner-options")?.classList.remove("active");
            window.location.href = brouterOruxUrl;
            return;
        }

        // 2. Si la ruta es mixta (contiene tramos punto a punto manuales o perfiles mezclados),
        // subimos el archivo puro (.gpx o .kml) a un hosting directo sin redirecciones HTML
        if (btnOrux) {
            btnOrux.disabled = true;
            btnOrux.innerHTML = `<span>Preparando...</span>`;
        }
        if (planner && typeof planner.showToast === 'function') {
            planner.showToast(`Enviando ${format.toUpperCase()} mixto a OruxMaps...`);
        }

        try {
            const formData = new FormData();
            const fileBlob = new Blob([content], { type: mimeType });
            formData.append("files[]", fileBlob, filename);

            const response = await fetch("https://uguu.se/upload", {
                method: "POST",
                body: formData
            });

            if (!response.ok) throw new Error("Fallo al alojar archivo temporal");

            const result = await response.json();
            const directHttpsUrl = result?.files?.[0]?.url;
            if (!directHttpsUrl) throw new Error("URL directa no recibida");

            // La URL de uguu.se termina literalmente en .gpx o .kml y devuelve XML puro
            const oruxTrackDeepLink = directHttpsUrl.replace(/^https?:\/\//i, "orux-track://");

            document.getElementById("side-panel-planner-options")?.classList.remove("active");
            window.location.href = oruxTrackDeepLink;

        } catch (err) {
            console.warn("Fallo en enlace directo para ruta mixta, descargando archivo local:", err);
            if (planner && typeof planner.showToast === 'function') {
                planner.showToast("Descargando archivo para abrir en OruxMaps...");
            }
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

        if (planner.points && planner.points.length > 0) {
            planner.points.forEach((p, idx) => {
                gpx += `  <wpt lat="${p.coords[1]}" lon="${p.coords[0]}">\n`;
                if (p.coords[2] !== undefined) gpx += `    <ele>${p.coords[2]}</ele>\n`;
                gpx += `    <name><![CDATA[${p.name || ('Punto ' + (idx + 1))}]]></name>\n`;
                gpx += `  </wpt>\n`;
            });
        }

        if (planner.segments && planner.segments.length > 0 && planner.points.length >= 2) {
            gpx += `  <trk>\n`;
            gpx += `    <name><![CDATA[Ruta Mixta Otromundo]]></name>\n`;
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
