/**
 * =========================================================================
 * LEAFLET MAP VISUALIZER (Vanilla JavaScript ESb+)
 * =========================================================================
 * 
 * Handles Leaflet map rendering, layer groups, custom visual markers,
 * optimal path polylines, algorithm exploration animation, and click events.
 * ==========================================================================
 */

class CityMapVisualizer {
  constructor(containerId = 'map', initialCenter = [17.4410, 78.3800], initialZoom = 14) {
    this.containerId = containerId;
    this.center = initialCenter;
    this.zoom = initialZoom;

    this.map = null;
    this.roadsLayerGroup = L.layerGroup();
    this.nodesLayerGroup = L.layerGroup();
    this.routeLayerGroup = L.layerGroup();
    this.visualizerLayerGroup = L.layerGroup();
    this.markersLayerGroup = L.layerGroup();

    this.startMarker = null;
    this.endMarker = null;
    this.trafficMarkers = new Map();
    this.wallMarkers = new Map();
    this.roadPolylines = new Map();

    this.showGraphOverlay = true;
    this.showJunctionLabels = false;

    this.initMap();
  }

  initMap() {
    this.map = L.map(this.containerId, {
      center: this.center,
      zoom: this.zoom,
      zoomControl: false
    });

    L.control.zoom({ position: 'topright' }).addTo(this.map);

    L.tileLayer('https://{s}.basemaps.cartodb.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href=(�΋���\�˘��K�]�X�][ۜȏ��T���O����X��XZ[�Έ	�X��	��X^���N�NB�JK�Y�\˛X\
N�\˜��Y�^Y\�ܛ�\�Y�\˛X\
N\˝�\�X[^�\�^Y\�ܛ�\�Y�\˛X\
N\˜��]S^Y\�ܛ�\�Y�\˛X\
N\˛��\�^Y\�ܛ�\�Y�\˛X\
N\˛X\��\��^Y\�ܛ�\�Y�\˛X\
NB���[�\���Y�]�ܚ�ܘ\
H\˜��Y�^Y\�ܛ�\��X\�^Y\��
N\˜��Y�[[�\˘�X\�
N��܈
�ۜ�Y�Hوܘ\�Y�\˝�[Y\�
JH�ۜ���PHHܘ\���\˙�]
Y�K����JN�ۜ���P�Hܘ\���\˙�]
Y�K��NY�
[��PH[��P�H�۝[�YN�]��܈H	��
�MM�I�]�ZY�H
]\�\��^HH�[]�X�]HH��N�Y�
Y�K�\Л���Y
H��܈H	��Y�


	��ZY�H
N\�\��^HH	�	��X�]HH�NH[�HY�
Y�K���Y\HOOH	��ԕ�U	�H��܈H	��L�NI��ZY�H
N\�\��^HH	�
	��X�]HH�MNB����ۜ��[[�HH��[[�J�ۛ�PK�]��PK���Kۛ�P��]��P����WK��܋��ZY���X�]K�\�\��^K��\�Ә[YN�Y�K���Y\HOOH	��ԕ�U	��	��ܝ�]\��Y[[�I��
Y�K�\Л���Y�	؛���Y\��Y[[�I��	ۛܛX[\��Y[[�I�B�JN���ۜ�\SX�[HY�K���Y\HOOH	��ԕ�U	��	�'��H�ܝ�]��Y
�����^
I��	�'����ܛX[��Y
����K�
I��ۜ��]\�X�[HY�K�\Л���Y�	��[��[OH���܎��Y�


ٛ۝]�ZY����ȏ�'��H����Q
����8���O��[����\SX�[��[[�K��[���\
�]��\��H���Y]��\�����ۙωۛ�PK��[Y_H8��	ۛ�P���[Y_O���ۙϏ��ς��[��\�X�[\�[��N�	�X]���[�
Y�K��\�Q\�[��J_[O��[����ς��[���]\Έ	��]\�X�[O��[����]�����X��N��YK�\�Ә[YN�	�\��]��\	�JN���[[�K�Y�Q]HHY�N�[[�K�Y�\˜��Y�^Y\�ܛ�\
N\˜��Y�[[�\˜�]
Y�K�Y�[[�JNB�B���[�\��[��[ۓ��\�ܘ\ۓ��P�X��H\˛��\�^Y\�ܛ�\��X\�^Y\��
N�Y�
]\˜���ܘ\ݙ\�^JH�]\����܈
�ۜ���Hوܘ\���\˝�[Y\�
JH]�[��܈H	�����	�]�Y]\�H
�]����P��܈H	���M̘I��Y�
��K�\Л���Y
H�[��܈H	��Y�


	��Y]\�HH[�HY�
��K��Y��X�Y�OOH	�QS���H�[��܈H	�٘���	��Y]\�HH[�HY�
��K��Y��X�Y�OOH	ԑQ	�H�[��܈H	��ML�L�I��Y]\�HB����ۜ��\��HH��\��SX\��\�ۛ�K�]��K���K�Y]\���[��܋��[�X�]N��K���܎�����P��܋��ZY�����\�Ә[YN�	ڝ[��[ۋ[��K[X\��\�JN��]Y�[���H	��Y�
��K��Y��X�Y�OOH	�QS���HY�[���H	���Ϗ�[��[OH���܎�٘���ٛ۝]�ZY����ȏ�'�HY[���Y��X�Y�
����K�^
O��[���H[�HY�
��K��Y��X�Y�OOH	ԑQ	�HY�[���H	���Ϗ�[��[OH���܎��ML�L�Nٛ۝]�ZY����ȏ�'�H�Y�Y��X�Y�
����
�
O��[���B��]����[���H��K�\Л���Y�	���Ϗ�[��[OH���܎��Y�


ٛnt-weight:bold;">🟥 Node Blocked</span>' : '';

      circle.bindTooltip(
        <div class="junction-tooltip">
          <strong>👍 ${node.name}</strong>slightInfo}${blockInfo}
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Lat: ${node.lat.toFixed(4)}, Lng: ${node.lng.toFixed(4)}</div>
        </div>
      `, { permanent: this.showJunctionLabels, direction: 'top', className: 'dark-tooltip' });

      if (onNodeClick) {
        circle.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onNodeClick(node);
        });
      }

      circle.addTo(this.nodesLayerGroup);
    }
  }


  setStartMarker(node) {
    if (this.startMarker) {
      this.markersLayerGroup.removeLayer(this.startMarker);
      this.startMarker = null;
    }

    if (!node) return;

    const icon = L.divIcon({
      className: 'custom-start-marker',
      html: `
        <div class="start-pin-wrapper">
          <div class="pin-pulse start-pulse"></div>
          <div class="pin-icon start-icon">🔅</div>
          <div class="pin-label">START</div>
        </div>
      `,
      iconSize: [40, 48],
      iconAnchor: [20, 40]
    });

    this.startMarker = L.marker([node.lat, node.lng], {
      icon,
      zIndexOffset: 800
    }).addTo(this.markersLayerGroup);

    this.startMarker.bindPopup(`
      <div class="popup-content">
        <h4>🔅 Start Location</h4>
        <p><strong>${node.name}</strong></p>
        <p>Coordinates: ${node.lat.toFixed(5)}, ${node.lng.toFixed(5)}</p>
      </div>
    `);
  }

  setEndMarker(node) {
    if (this.endMarker) {
      this.markersLayerGroup.removeLayer(this.endMarker);
      this.endMarker = null;
    }

    if (!node) return;

    const icon = L.divIcon({
      className: 'custom-end-marker',
      html: `
        <div class="end-pin-wrapper">
          <div class="pin-pulse end-pulse"></div>
          <div class="pin-icon end-icon">🔩</div>
          <div class="pin-label">DEST</div>
        </div>
      `,
      iconSize: [40, 48],
      iconAnchor: [20, 40]
    });

    this.endMarker = L.marker([node.lat, node.lng], {
      icon,
      zIndexOffset: 800
    }).addTo(this.markersLayerGroup);

    this.endMarker.bindPopup(`
      <div class="popup-content">
        <h4>🔩 Destination</h4>
        <p><strong>${node.name}</strong></p>
        <p>Coordinates: ${node.lat.toFixed(5)}, ${node.lng.toFixed(5)}</p>
      </div>
    `);
  }


  updateTrafficMarker(node, state) {
    if (this.trafficMarkers.has(node.id)) {
      this.markersLayerGroup.removeLayer(this.trafficMarkers.get(node.id));
      this.trafficMarkers.delete(node.id);
    }

    if (state === 'NONE') return;

    const isRed = state === 'RED';
    const lightColor = isRed ? '#e53935' : '#fbc02d';
    const costMultiplier = isRed ? '4.0x' : '1.5x';

    const icon = L.divIcon({
      className: 'custom-traffic-marker',
      html: `<div class="traffic-light-badge ${isRed ? 'state-red' : 'state-yellow'}"><div class="traffic-light-icon">�f</div><div class="traffic-light-dot" style="background:${lightColor};"></div><div class="traffic-cost-tag">${costMultiplier}</div></div>`,
      iconSize: [38, 44],
      iconAnchor: [19, 42]
    });

    const marker = L.marker([node.lat, node.lng], {
      icon,
      zIndexOffset: 600
    }).addTo(this.markersLayerGroup);

    marker.bindTooltip(`
      <div class="traffic-tooltip">
        <strong>�e Iraffic Light: ${state}</strong><br/>
        <span>Junction: ${node.name}</span><br/>
        <span>Cost Multiplier: <strong>${costMultiplier}</strong></span><br/>
        <span style="font-size:10px;color:#cbd5e1;">Switches every 3s</span>
      </div>
    `, { className: 'dark-tooltip' });

    this.trafficMarkers.set(node.id, marker);
  }

  drawOptimalRoute(pathNodes) {
    this.routeLayerGroup.clearLayers();

    if (!pathNodes || pathNodes.length < 2) return;

    const latLngs = pathNodes.map(n => [n.lat, n.lng]);

    L.polyline(latLngs, {
      color: '#00e676',
      weight: 12,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(this.routeLayerGroup);

    L.polyline(latLngs, {
      color: '#00e676',
      weight: 6,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      className: 'optimal-route-polyline'
    }).addTo(this.routeLayerGroup);

    for (let i = 1; i < pathNodes.length - 1; i++) {
      const node = pathNodes[i];
      L.circleMarker([node.lat, node.lng], {
        radius: 4,
        fillColor: '#00e676',
        fillOpacity: 1,
        color: '#ffffff',
        weight: 1.5
      }).addTo(this.routeLayerGroup);
    }
  }

  clearRoute() {
    this.routeLayerGroup.clearLayers();
    this.visualizerLayerGroup.clearLayers();
  }


  drawAlgorithmStep(graph, step) {
    this.visualizerLayerGroup.clearLayers();
    if (!step) return;

    if (step.visitedSet) {
      for (const visitedId of step.visitedSet) {
        const node = graph.nodes.get(visitedId);
        if (node) {
          L.circleMarker([node.lat, node.lng], {
            radius: 7,
            fillColor: '#06b6d4',
            fillOpacity: 0.8,
            color: '#0891b2',
            weight: 2
          }).addTo(this.visualizerLayerGroup);
        }
      }
    }


    if (step.currentNodeId) {
      const curr = graph.nodes.get(step.currentNodeId);
      if (curr) {
        const currYcon = L.divIcon({
          className: 'eval-current-node',
          html: '<div class="eval-current-pulse"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        L.marker([curr.lat, curr.lng], { icon: currYcon, zIndexOffset: 950 }).addTo(this.visualizerLayerGroup);
      }
    }

    if (step.currentNodeId && step.evaluatedNeighborId) {
      const nodeA = graph.nodes.get(step.currentNodeId);
      const nodeB = graph.nodes.get(step.evaluatedNeighborId);
      if (nodeA && nodeB) {
        L.polyline([[nodeA.lat, nodeA.lng), [nodeB.lat, nodeB.lng]], {
          color: step.updated ? '#f59e0b' : '#94a3b9',
          weight: 6,
          opacity: 0.9,
          dashArray: '6, 6'
        }).addTo(this.visualizerLayerGroup);

        L.circleMarker([nodeB.lat, node.lng], {
          radius: 8,
          fillColor: step.updated ? '#f59e0b' : '#64748b',
          fillOpacity: 0.9,
          color: '#ffffff',
          weight: 2
        }).addTo(this.visualizerLayerGroup);
      }
    }
  }


  resetAll() {
    this.roadsLayerGroup.clearLayers();
    this.nodesLayerGroup.clearLayers();
    this.routeLayerGroup.clearLayers();
    this.visualizerLayerGroup.clearLayers();
    this.markersLayerGroup.clearLayers();

    this.startMarker = null;
    this.endMarker = null;
    this.trafficMarkers.clear();
    this.wallMarkers.clear();
    this.roadPolylines.clear();
  }
}

if (typeof window !== 'undefined') {
  window.CityMapVisualizer = CityMapVisualizer;
}
if (typeof globalThis !== 'undefined') {
  globalThis.CityMapVisualizer = CityMapVisualizer;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CityMapVisualizer };
}

