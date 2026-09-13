/**
 * ============================================================================
 * POINTS OF INTEREST & SEARCH ENGINE (js/pois.js)
 * ============================================================================
 *
 * Responsibilities:
 * 1. Loads and manages Hyderabad POIs across 8 categories:
 *    Hospital, College, Hotel, Restaurant, Fuel, Metro, Shopping, Landmark.
 * 2. Provides real-time search with instant autocomplete dropdown.
 * 3. Renders clean custom map markers with category badge icons.
 * 4. Supports "Set Start" and "Set Destination" directly from POI markers & search results.
 * 5. Snaps directly to road network nodes (Section 43 & 44).
 */

class POIManager {
    constructor(leafletMap, onSelectLocation) {
        this.map = leafletMap;
        this.onSelectLocation = onSelectLocation; // callback(nodeId, type)
        this.pois = [];
        this.markers = new Map(); // id -> L.Marker
        this.poiLayer = L.layerGroup().addTo(this.map);
        this.isVisible = true;
        this.activeCategoryFilter = 'ALL';

        this.initData();
    }

    async initData() {
        try {
            const resp = await fetch('data/pois.json');
            if (resp.ok) {
                this.pois = await resp.json();
            } else {
                this.pois = this.getFallbackPOIs();
            }
        } catch (e) {
            this.pois = this.getFallbackPOIs();
        }
        this.renderMarkers();
    }

    getFallbackPOIs() {
        return [
            { id: "poi_hosp_1", name: "KIMS Hospitals Begumpet", category: "Hospital", icon: "🏥", lat: 17.4420, lng: 78.4720, nearestNode: "begumpet", description: "Multi-specialty hospital near Begumpet flyover." },
            { id: "poi_hosp_2", name: "Yashoda Hospitals Somajiguda", category: "Hospital", icon: "🏥", lat: 17.4258, lng: 78.4552, nearestNode: "somajiguda", description: "Super-specialty medical center on Raj Bhavan Road." },
            { id: "poi_coll_1", name: "Nizam College (Osmania University)", category: "College", icon: "🎓", lat: 17.3995, lng: 78.4730, nearestNode: "nampally", description: "Historic constituent college of Osmania University." },
            { id: "poi_coll_2", name: "Administrative Staff College of India (ASCI)", category: "College", icon: "🎓", lat: 17.4180, lng: 78.4600, nearestNode: "raj_bhavan", description: "Premier management college near Raj Bhavan." },
            { id: "poi_hotl_1", name: "Hyderabad Marriott Hotel & Convention Centre", category: "Hotel", icon: "🏨", lat: 17.4260, lng: 78.4845, nearestNode: "kavadiguda", description: "Luxury 5-star lakeside hotel near Tank Bund." },
            { id: "poi_hotl_2", name: "Taj Vivanta Begumpet", category: "Hotel", icon: "🏨", lat: 17.4435, lng: 78.4640, nearestNode: "begumpet", description: "Premium luxury business hotel on Mayur Marg." },
            { id: "poi_rest_1", name: "Paradise Biryani (Secunderabad Flagship)", category: "Restaurant", icon: "🍴", lat: 17.4422, lng: 78.4878, nearestNode: "paradise", description: "World-renowned Hyderabadi Biryani destination established in 1953." },
            { id: "poi_rest_2", name: "Eat Street Necklace Road", category: "Restaurant", icon: "🍴", lat: 17.4264, lng: 78.4623, nearestNode: "necklace_mid", description: "Open-air waterfront culinary food court along PVNR Marg." },
            { id: "poi_fuel_1", name: "HP Auto Fuel Station Lakdikapul", category: "Fuel", icon: "⛽", lat: 17.4035, lng: 78.4625, nearestNode: "lakdikapul", description: "24/7 petrol and clean CNG refueling station." },
            { id: "poi_fuel_2", name: "IndianOil Fuel Station Tank Bund", category: "Fuel", icon: "⛽", lat: 17.4145, lng: 78.4795, nearestNode: "tankbund_south", description: "Promenade fuel station on Tank Bund." },
            { id: "poi_metr_1", name: "Khairatabad Metro Station (Red Line)", category: "Metro", icon: "🚇", lat: 17.4116, lng: 78.4611, nearestNode: "khairatabad", description: "Major Hyderabad Metro interchange along Corridor 1." },
            { id: "poi_metr_2", name: "Ameerpet Metro Station (Red & Blue Lines)", category: "Metro", icon: "🚇", lat: 17.4360, lng: 78.4554, nearestNode: "ameerpet", description: "Largest dual-level junction metro station in Hyderabad." },
            { id: "poi_metr_3", name: "Paradise Metro Station (Blue Line)", category: "Metro", icon: "🚇", lat: 17.4420, lng: 78.4870, nearestNode: "paradise", description: "Rapid transit station connecting Secunderabad and Hitec City." },
            { id: "poi_shop_1", name: "Hyderabad Central Mall Punjagutta", category: "Shopping", icon: "🛍️", lat: 17.4270, lng: 78.4523, nearestNode: "punjagutta", description: "Flagship shopping mall and retail hub." },
            { id: "poi_land_1", name: "BR Ambedkar Telangana State Secretariat", category: "Landmark", icon: "📍", lat: 17.4089, lng: 78.4755, nearestNode: "secretariat", description: "Grand state administration headquarters on lakeside NTR Marg." },
            { id: "poi_land_2", name: "Tank Bund Road Promenade (Buddha View)", category: "Landmark", icon: "📍", lat: 17.4215, lng: 78.4845, nearestNode: "tankbund_mid", description: "Scenic promenade overlooking historic Hussain Sagar." },
            { id: "poi_land_3", name: "Sanjeevaiah Park Promenade", category: "Landmark", icon: "📍", lat: 17.4374, lng: 78.4691, nearestNode: "sanjeevaiah", description: "Lush public waterfront park along northern shore." },
            { id: "poi_land_4", name: "Lumbini Park & Laser Show", category: "Landmark", icon: "📍", lat: 17.4140, lng: 78.4785, nearestNode: "tankbund_south", description: "Waterfront urban park adjacent to Secretariat and Tank Bund." }
        ];
    }

    renderMarkers() {
        this.poiLayer.clearLayers();
        this.markers.clear();

        if (!this.isVisible) return;

        this.pois.forEach(poi => {
            if (this.activeCategoryFilter !== 'ALL' && poi.category !== this.activeCategoryFilter) {
                return;
            }

            const iconHtml = `
                <div class="poi-marker-bubble cat-${poi.category.toLowerCase()}">
                    <span class="poi-emoji">${poi.icon}</span>
                </div>
            `;

            const customIcon = L.divIcon({
                className: 'custom-poi-marker',
                html: iconHtml,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            const marker = L.marker([poi.lat, poi.lng], { icon: customIcon });

            const popupContent = `
                <div class="poi-popup-card">
                    <div class="poi-popup-header">
                        <span class="poi-popup-icon">${poi.icon}</span>
                        <div>
                            <h4 class="poi-popup-title">${poi.name}</h4>
                            <span class="poi-popup-badge">${poi.category}</span>
                        </div>
                    </div>
                    <p class="poi-popup-desc">${poi.description}</p>
                    <div class="poi-popup-actions">
                        <button class="btn btn-sm btn-poi-start" data-node="${poi.nearestNode}">🟢 Set as Start</button>
                        <button class="btn btn-sm btn-poi-dest" data-node="${poi.nearestNode}">🔴 Set as Destination</button>
                    </div>
                </div>
            `;

            marker.bindPopup(popupContent, { className: 'poi-custom-popup', maxWidth: 260 });
            marker.on('popupopen', () => {
                setTimeout(() => {
                    const btnStart = document.querySelector('.btn-poi-start');
                    const btnDest = document.querySelector('.btn-poi-dest');
                    if (btnStart) {
                        btnStart.onclick = () => {
                            if (this.onSelectLocation) this.onSelectLocation(poi.nearestNode, 'start');
                            marker.closePopup();
                        };
                    }
                    if (btnDest) {
                        btnDest.onclick = () => {
                            if (this.onSelectLocation) this.onSelectLocation(poi.nearestNode, 'end');
                            marker.closePopup();
                        };
                    }
                }, 10);
            });

            this.poiLayer.addLayer(marker);
            this.markers.set(poi.id, marker);
        });
    }

    setVisibility(visible) {
        this.isVisible = visible;
        if (visible) {
            this.renderMarkers();
        } else {
            this.poiLayer.clearLayers();
        }
    }

    setCategoryFilter(category) {
        this.activeCategoryFilter = category;
        this.renderMarkers();
    }

    search(query) {
        if (!query || query.trim().length === 0) return [];
        const q = query.toLowerCase().trim();
        return this.pois.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q)
        );
    }

    focusPOI(poiId) {
        const poi = this.pois.find(p => p.id === poiId);
        if (!poi) return;

        this.map.setView([poi.lat, poi.lng], 16, { animate: true });
        const marker = this.markers.get(poiId);
        if (marker) {
            marker.openPopup();
        }
    }
}

if (typeof window !== 'undefined') {
    window.POIManager = POIManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = POIManager;
}
