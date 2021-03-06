/**
 * @fileOverview graphic util
 * @author huangtonger@aliyun.com
 */

const MathUtil = require('./math');
const BaseUtil = require('./base');
const Global = require('../global');
// 一共支持8个方向的自环，每个环占的角度是45度，在计算时再二分，为22.5度
const SELF_LINK_SIN = Math.sin(Math.PI / 8);
const SELF_LINK_COS = Math.cos(Math.PI / 8);

function traverse(data, fn) {
  if (fn(data) === false) {
    return;
  }
  BaseUtil.each(data.children, child => {
    traverse(child, fn);
  });
}

const GraphicUtil = {
  getBBox(element, parent) {
    const bbox = element.getBBox();
    let leftTop = {
      x: bbox.minX,
      y: bbox.minY
    };
    let rightBottom = {
      x: bbox.maxX,
      y: bbox.maxY
    };
    // 根据父元素变换矩阵
    if (parent) {
      const matrix = parent.getMatrix();
      leftTop = MathUtil.applyMatrix(leftTop, matrix);
      rightBottom = MathUtil.applyMatrix(rightBottom, matrix);
    }

    return {
      minX: leftTop.x,
      minY: leftTop.y,
      maxX: rightBottom.x,
      maxY: rightBottom.y
    };
  },
  // 获取某元素的自环边配置
  getLoopCfgs(cfg) {
    const item = cfg.sourceNode || cfg.targetNode;
    const containerMatrix = item.get('group')
      .getMatrix();
    const bbox = item.getKeyShape()
      .getBBox();
    const loopCfg = cfg.loopCfg || {};
    // 距离keyShape边的最高距离
    const dist = loopCfg.dist || Math.max(bbox.width, bbox.height) * 2;
    // 自环边与keyShape的相对位置关系
    const position = loopCfg.position || Global.loopPosition;
    const r = Math.max(bbox.width, bbox.height) / 2;
    const scaleRate = (r + dist) / r;
    // 中心取group上真实位置
    const center = [ containerMatrix[ 6 ], containerMatrix[ 7 ] ];
    const sinDelta = r * SELF_LINK_SIN;
    const cosDelta = r * SELF_LINK_COS;
    let startPoint = [ cfg.startPoint.x, cfg.startPoint.y ];
    let endPoint = [ cfg.endPoint.x, cfg.endPoint.y ];
    // 如果定义了锚点的，直接用锚点坐标，否则，根据自环的 cfg 计算
    if (startPoint[0] === endPoint[0] && startPoint[1] === endPoint[1]) {
      switch (position) {
        case 'top':
          startPoint = [ center[0] - sinDelta, center[1] - cosDelta ];
          endPoint = [ center[0] + sinDelta, center[1] - cosDelta ];
          break;
        case 'top-right':
          startPoint = [ center[0] + sinDelta, center[1] - cosDelta ];
          endPoint = [ center[0] + cosDelta, center[1] - sinDelta ];
          break;
        case 'right':
          startPoint = [ center[0] + cosDelta, center[1] - sinDelta ];
          endPoint = [ center[0] + cosDelta, center[1] + sinDelta ];
          break;
        case 'bottom-right':
          startPoint = [ center[0] + cosDelta, center[1] + sinDelta ];
          endPoint = [ center[0] + sinDelta, center[1] + cosDelta ];
          break;
        case 'bottom':
          startPoint = [ center[0] + sinDelta, center[1] + cosDelta ];
          endPoint = [ center[0] - sinDelta, center[1] + cosDelta ];
          break;
        case 'bottom-left':
          startPoint = [ center[0] - sinDelta, center[1] + cosDelta ];
          endPoint = [ center[0] - cosDelta, center[1] + sinDelta ];
          break;
        case 'left':
          startPoint = [ center[0] - cosDelta, center[1] + sinDelta ];
          endPoint = [ center[0] - cosDelta, center[1] - sinDelta ];
          break;
        case 'top-left':
          startPoint = [ center[0] - cosDelta, center[1] - sinDelta ];
          endPoint = [ center[0] - sinDelta, center[1] - cosDelta ];
          break;
        default:
          startPoint = [ center[0] - sinDelta, center[1] - cosDelta ];
          endPoint = [ center[0] + sinDelta, center[1] - cosDelta ];
      }
      // 如果逆时针画，交换起点和终点
      if (loopCfg.clockwise === false) {
        const swap = [ startPoint[0], startPoint[1] ];
        startPoint = [ endPoint[0], endPoint[1] ];
        endPoint = [ swap[0], swap[1] ];
      }
    }
    const startVec = [ startPoint[0] - center[0], startPoint[1] - center[1] ];
    const startExtendVec = BaseUtil.vec2.scale([], startVec, scaleRate);
    const controlPoint1 = [ center[0] + startExtendVec[0], center[1] + startExtendVec[1] ];
    const endVec = [ endPoint[0] - center[0], endPoint[1] - center[1] ];
    const endExtendVec = BaseUtil.vec2.scale([], endVec, scaleRate);
    const controlPoint2 = [ center[0] + endExtendVec[0], center[1] + endExtendVec[1] ];
    // 不管原 shape 如何，要画出自环 shape 应是 cubic
    cfg.shape = 'cubic';
    cfg.startPoint = { x: startPoint[0], y: startPoint[1] };
    cfg.endPoint = { x: endPoint[0], y: endPoint[1] };
    cfg.controlPoints = [
      { x: controlPoint1[0], y: controlPoint1[1] },
      { x: controlPoint2[0], y: controlPoint2[1] }
    ];
    return cfg;
  },
  traverseTree(data, fn) {
    if (typeof fn !== 'function') {
      return;
    }
    traverse(data, fn);
  },
  radialLayout(data, layout) {
    // 布局方式有 H / V / LR / RL / TB / BT
    const VERTICAL_LAYOUTS = [ 'V', 'TB', 'BT' ];
    const min = {
      x: Infinity,
      y: Infinity
    };
    const max = {
      x: -Infinity,
      y: -Infinity
    };
    // 默认布局是垂直布局TB，此时x对应rad，y对应r
    let rScale = 'x';
    let radScale = 'y';
    if (layout && VERTICAL_LAYOUTS.indexOf(layout) >= 0) {
      // 若是水平布局，y对应rad，x对应r
      radScale = 'x';
      rScale = 'y';
    }
    let count = 0;
    this.traverseTree(data, node => {
      count++;
      if (node.x > max.x) {
        max.x = node.x;
      }
      if (node.x < min.x) {
        min.x = node.x;
      }
      if (node.y > max.y) {
        max.y = node.y;
      }
      if (node.y < min.y) {
        min.y = node.y;
      }
    });
    const avgRad = Math.PI * 2 / count;
    const radDiff = max[radScale] - min[radScale];
    if (radDiff === 0) {
      return data;
    }
    this.traverseTree(data, node => {
      const radial = (node[radScale] - min[radScale]) / radDiff * (Math.PI * 2 - avgRad) + avgRad;
      const r = node[rScale];
      node.x = r * Math.cos(radial);
      node.y = r * Math.sin(radial);
    });
    return data;
  }
};

module.exports = GraphicUtil;
