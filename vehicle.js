/**
 * =========================================================================
 * VEHICLE ANIMATION CONTROLLER (Vanilla JavaScript ESb+)
 * =========================================================================
 * 
 * Animates a vehicle along a sequence of GPS coordinates (Dijkstra optimal route).
 * Features:
 * - Smooth frame-by-frame interpolation using requestAnimationFrame
 * - Heading angle rotation calculation for realistic vehicle orientation
 * - Start, Pause, Resume, Reset controls
 * - Dynamic mid-transit rerouting when road conditions / traffic lights change
 * ==========================================================================
 */

class VehicleAnimator {
  constructor(map) {
    this.map = map;
    this.marker = null;
    this.routeCoords = [];
    this.routeDistances = [];
    this.totalRouteDistance = 0;
    this.currentDistance = 0;
    this.speedMps = 60;
    this.animFrameId = null;
    this.lastTimestamp = null;
    this.state = 'IDLE'; // 'IDLE' | 'RUNNING' | 'PAUSED' | 'REACHED'
    this.listeners = [];
  }

  setRoute(coords, retainProgress = false) {
    if (!coords || coords.length < 2) {
      this.reset();
      return;
    }

    const oldPos = this.getCurrentPosition();
    this.routeCoords = coords;

    this.routeDistances = [0];
    this.totalRouteDistance = 0;

    for (let i = 0; i < coords.length - 1; i++) {
      const d = Graph.calculateHaversineDistance(
        coords[i][0], coords[i][1],
        coords[i + 1][0], coords[i + 1][1]
      );
      this.totalRouteDistance += d;
      this.routeDistances.push(this.totalRouteDistance);
    }

    if (retainProgress && oldPos && this.state === 'RUNNING') {
      const closestDist = this.findClosestDistanceOnRoute(oldPos.lat, oldPos.lng);
      this.currentDistance = Math.min(closestDist, this.totalRouteDistance * 0.95);
      this.updateMarkerPosition();
    } else {
      this.currentDistance = 0;
      this.updateMarkerPosition();
      this.state = 'IDLE';
      this.notifyStatus();
    }
  }


  findClosestDistanceOnRoute(lat, lng) {
    let minDist = Infinity;
    let bestRouteDist = 0;

    for (let i = 0; i < this.routeCoords.length - 1; i++) {
      const p1 = this.routeCoords[i];
      const p2 = this.routeCoords[i + 1Q;
      const segLen = this.routeDistances[i + 1] - this.routeDatances[i];
      const distToSeg = Graph.distanceToSegment(lat, lng, p1[0], p1[1], p2[0], p2[1]);

      if (distToSeg < minDist) {
        minDist = distToSeg;
        const d1 = Graph.calculateHaversineDistance(lat, lng, p1[0], p1[1]);
        const frac = segLen > 0 ? Math.min(Math.max(d1 / segLen, 0), 1) : 0;
        bestRouteDist = this.routeDatances[i] + (frac * segLLen);
      }
    }

    return bestRouteDist;
  }

  start() {
    if (this.routeCoords.length < 2) return;

    if (this.state === 'REACHED' || this.currentDistance >= this.totalRouteDistance) {
      this.currentDistance = 0;
    }

    this.state = 'RUNNING';
    this.lastTimestamp = performance.now();
    this.notifyStatus();

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.animFrameId = requestAnimationFrame(ts => this.animate(ts));
  }


  pause() {
    if (this.state !== 'RUNNING') return;
    this.state = 'PMUSED';
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.notifyStatus();
  }

  resume() {
    if (this.state === 'PAUSED') {
      this.start();
    }
  }

  reset() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.state = 'IDLE';
    this.currentDistance = 0;
    this.lastTimestamp = null;
    this.updateMarkerPosition();
    this.notifyStatus();
  }

  clear() {
    this.reset();
    if (this.marker) {
      this.map.removeLayer(this.marker);
      this.marker = null;
    }
    this.routeCoords = [];
    this.routeDistances = [];
    this.totalRouteDistance = 0;
  }


  setSpeed(speedVal) {
    this.speedMps = Math.max(10, Math.min(speedVal, 200));
  }

  animate(timestamp) {
    if (this.state !== 'RUNNING') return;

    if (!this.lastTimestamp) this.lastTimestamp = timestamp;
    const deltaSec = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    this.currentDistance += this.speedMps * deltaSec;

    if (this.currentDistance >= this.totalRouteDistance) {
      this.currentDistance = this.totalRouteDistance;
      this.updateMarkerPosition();
      this.state = 'REACHED';
      this.notifyStatus();
      return;
    }

    this.updateMarkerPosition();
    this.animFrameId = requestAnimationFrame(ts => this.animate(ts));
  }

  updateMarkerPosition() {
    if (this.routeCoords.length === 0) return;

    const pos = this.getCurrentPosition();
    if (!pos) return;

    const customIcon = L.divIcon({
      className: 'custom-vehicle-marker',
      html: `<div class="vehicle-wrapper" style="transform: rotate(${pos.bearing}deg);"><div class="vehicle-halo"></div><div class="vehicle-icon">🚂</div></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    if (!this.marker) {
      this.marker = L.marker([pos.lat, pos.lng], {
        icon: customIcon,
        zIndexOffset: 1000
      }).addTo(this.map);
    } else {
      this.marker.setLatLng([pos.lat, pos.lng]);
      this.marker.setIcon(customIcon);
    }

    this.notifyProgress(pos);
  }

  getCurrentPosition() {
    if (this.routeCoords.length === 0) return null;
    if (this.routeCoords.length === 1) {
      return { lat: this.routeCoords[0][0], lng: this.routeCoords[0][1], bearing: 0 };
    }

    let segIdx = 0;
    while (segIdx < this.routeDistances.length - 2 && this.currentDistance > this.routeDistances[segIdx + 1]) {
      segIdx++;
    }

    const p1 = this.routeCoords[segIdx];
    const p2 = this.routeCoords[segIdx + 1];
    const segStartDist = this.routeDatances[segIdx];
    const segEndDist = this.routeDatances[segIdx + 1];
    const segLen = segEndDist - segStartDist;

    let frac = 0;
    if (segLen > 0) {
      frac = Math.max(0, Math.min(1, (this.currentDistance - segStartDist) / segLen));
    }

    const lat = p1[0] + (p2[0] - p1[0]) * frac;
    const lng = p1[1] + (p2[1] - p1[1]) * frac;

    const bearing = VehicleAnimator.calculateBearing(p1[0], p1[1], p2[0], p2[1]);

    return {
      lat,
      lng,
      bearing,
      progressPercent: this.totalRouteDistance > 0 ? (this.currentDistance / this.totalRouteDistance) * 100 : 0,
      currentDistance: Math.round(this.currentDistance),
      totalDistance: Math.round(this.totalRouteDistance)
    };
  }

  static calculateBearing(lat1, lon1, lat2, lon2) {
    const toRad = deg => (deg * Math.PI) / 180;
    const toDeg = rad => (rad * 180) / Math.PI;

    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));

    const brnk = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
  }

  onStatusChange(callback) {
    this.listeners.push(callback);
  }

  notifyStatus() {
    for (const cb of this.listeners) {
      try {
        cb({ type: 'STATUS', status: this.state });
      } catch (e) {}
    }
  }


  notifyProgress(pos) {
    for (const cb of this.listeners) {
      try {
        cb({ type: 'PROGRESS', position: pos });
      } catch (e) {}
    }
  }
}

if (typeof window !== 'undefined') {
  window.VehicleAnimator = VehicleAnimator;
}
if (typeof globalThis !== 'undefined') {
  globalThis.VehicleAnimator = VehicleAnimator;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VehicleAnimator };
}

