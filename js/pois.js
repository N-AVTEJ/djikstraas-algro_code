/**
 * ============================================================================
 * POINTS OF INTEREST (POI) & SEARCH ENGINE (js/pois.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Manages curated Hyderabad POIs across 8 categories:
 *    🏥 Hospital, 🎓 College, 🏨 Hotel, 🍴 Restaurant, ⛽ Fuel, 🚇 Metro, 🛍 Shopping, 📍 Landmark.
 * 2. Renders sleek, uncluttered POI markers with custom SVG pins on Leaflet map.
 * 3. Provides instant search autocomplete matching POIs, intersections, and landmarks.
 * 4. Enables 1-click setting of Start / Destination directly from POI popups or search results.
 */

if (typeof require !== 'undefined') {
    if (typeof HYDERABAD_POIS_DATA === 'undefined') {
        const dataMod = require('./data.js');
        globalThis.HYDERABAD_POIS_DATA = dataMod.HYDERABAD_POIS_DATA;
    }
}

class POIManager {
    constructor(leafletMap, graph, onSelectLocation) {
        this.map = leafletMap;
        this.graph = graph;
        this.onSelectLocation = onSelectLocation; // Callback: (node, type: 'start'|'end')

        this.pois = typeof HYDERABAD_POIS_DATA !== 'undefined' ? HYDERABAD_POIS_DATA : [];
        this.layerGroup = null;
        this.isVisible = true;

        if (this.map && typeof L !== 'undefined') {
            this.layerGroup = L.layerGroup().addTo(this.map);
            this.renderMarkers();
        }
    }

    /**
     * Category Icon Mapping
     */
    static getCategoryIcon(cat) {
        const icons = {
            hospital: '🏥',
            college: '🎓',
            hotel: '🏨',
            restaurant: '🍴',
            fuel: '⛽',
            metro: '🚇',
            shopping: '🛍',
            landmark: '📍'
        };
        return icons[cat] || '📍';
    }

    /**
     * Render all POI markers on the Leaflet map layer
     */
    renderMarkers() {
        if (!this.layerGroup) return;
        this.layerGroup.clearLayers();

        if (!this.isVisible) return;

        this.pois.forEach(poi => {
            const iconHtml = `
                <div class="poi-pin-marker ${poi.category}">
                    <span class="poi-icon">${poi.icon || POIManager.getCategoryIcon(poi.category)}</span>
                </div>
            `;

            const icon = L.divIcon({
                className: 'custom-poi-div-icon',
                html: iconHtml,
                iconSize: [28, 28],
                iconAnchor: [14, 28],
                popupAnchor: [0, -26]
            });

            const marker = L.marker([poi.lat, poi.lng], { icon, zIndexOffset: 600 });

            const popupContent = `
                <div class="poi-popup-card">
                    <div class="poi-popup-header">
                        <span class="poi-popup-icon">${poi.icon || '📍'}</span>
                        <div class="poi-popup-title-group">
                            <h4 class="poi-popup-title">${poi.name}</h4>
                            <span class="poi-popup-category">${poi.category.toUpperCase()}</span>
                        </div>
                    </div>
                    <p class="poi-popup-address">${poi.address}</p>
                    <div class="poi-popup-actions">
                        <button class="btn btn-sm btn-poi-start" data-poi-id="${poi.id}">🟢 Set as Start</button>
                        <button class="btn btn-sm btn-poi-end" data-poi-id="${poi.id}">🔴 Set as Destination</button>
                    </div>
                </div>
            `;

            marker.bindPopup(popupContent, { className: 'glass-leaflet-popup', minWidth: 220 });

            marker.on('popupopen', () => {
                const el = marker.getPopup().getElement();
                if (!el) return;

                const btnStart = el.querySelector('.btn-poi-start');
                const btnEnd = el.querySelector('.btn-poi-end');

                if (btnStart) {
                    btnStart.onclick = () => {
                        this.handlePoiSelect(poi, 'start');
                        marker.closePopup();
                    };
                }
                if (btnEnd) {
                    btnEnd.onclick = () => {
                        this.handlePoiSelect(poi, 'end');
                        marker.closePopup();
                    };
                }
            });

            this.layerGroup.addLayer(marker);
        });
    }

    handlePoiSelect(poi, type) {
        let node = null;
        if (poi.nearestNode && this.graph.nodes.has(poi.nearestNode)) {
            node = this.graph.nodes.get(poi.nearestNode);
        } else {
            const snapped = this.graph.findNearestRoadAndNode(poi.lat, poi.lng);
            node = snapped?.node;
        }

        if (node && this.onSelectLocation) {
            this.onSelectLocation(node, type, poi);
        }
    }

    setVisibility(visible) {
        this.isVisible = Boolean(visible);
        if (this.layerGroup) {
            if (this.isVisible) {
                this.renderMarkers();
                if (!this.map.hasLayer(this.layerGroup)) {
                    this.map.addLayer(this.layerGroup);
                }
            } else {
                this.layerGroup.clearLayers();
            }
        }
    }

    /**
     * Full-text search matching POIs, intersections, and landmarks
     */
    search(query) {
        if (!query || typeof query !== 'string') return [];
        const q = query.trim().toLowerCase();
        if (q.length === 0) return [];

        const results = [];

        // 1. Search POIs
        this.pois.forEach(poi => {
            let score = 0;
            const nameLower = poi.name.toLowerCase();
            const addrLower = (poi.address || '').toLowerCase();
            const catLower = poi.category.toLowerCase();

            if (nameLower === q) score += 100;
            else if (nameLower.startsWith(q)) score += 50;
            else if (nameLower.includes(q)) score += 30;
            else if (catLower.startsWith(q)) score += 25;
            else if (addrLower.includes(q)) score += 15;

            if (score > 0) {
                results.push({
                    type: 'poi',
                    id: poi.id,
                    title: poi.name,
                    subtitle: poi.address,
                    category: poi.category,
                    icon: poi.icon || POIManager.getCategoryIcon(poi.category),
                    lat: poi.lat,
                    lng: poi.lng,
                    nearestNode: poi.nearestNode,
                    score
                });
            }
        });

        // 2. Search Graph Intersections / Roads
        for (const [, node] of this.graph.nodes) {
            let score = 0;
            const nameLower = node.name.toLowerCase();
            if (nameLower === q) score += 90;
            else if (nameLower.startsWith(q)) score += 45;
            else if (nameLower.includes(q)) score += 20;

            if (score > 0) {
                results.push({
                    type: 'intersection',
                    id: node.id,
                    title: node.name,
                    subtitle: 'Road Intersection / Junction',
                    category: 'landmark',
                    icon: '🛣️',
                    lat: node.lat,
                    lng: node.lng,
                    nodeId: node.id,
                    score
                });
            }
        }

        // Sort by relevance score descending
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, 7); // Top 7 suggestions
    }
}

if (typeof window !== 'undefined') {
    window.POIManager = POIManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = POIManager;
}
