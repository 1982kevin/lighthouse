/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* globals self Util */

/** @typedef {import('./dom.js')} DOM */
/** @typedef {LH.Artifacts.Rect} Rect */
/** @typedef {{width: number, height: number}} Size */

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * @param {Rect} rect
 */
function getRectCenterPoint(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

class ElementScreenshotRenderer {
  /**
   * Given the location of an element and the sizes of the preview and screenshot,
   * compute the absolute positions (in screenshot coordinate scale) of the screenshot content
   * and the highlighted rect around the element.
   * @param {Rect} elementRectInScreenshotCoords
   * @param {Size} elementPreviewSizeInScreenshotCoords
   * @param {Size} screenshotSize
   */
  static getScreenshotPositions(elementRectInScreenshotCoords,
      elementPreviewSizeInScreenshotCoords, screenshotSize) {
    const elementRectCenter = getRectCenterPoint(elementRectInScreenshotCoords);

    // Try to center clipped region.
    const screenshotLeftVisibleEdge = clamp(
      elementRectCenter.x - elementPreviewSizeInScreenshotCoords.width / 2,
      0, screenshotSize.width - elementPreviewSizeInScreenshotCoords.width
    );
    const screenshotTopVisisbleEdge = clamp(
      elementRectCenter.y - elementPreviewSizeInScreenshotCoords.height / 2,
      0, screenshotSize.height - elementPreviewSizeInScreenshotCoords.height
    );

    return {
      screenshot: {
        left: screenshotLeftVisibleEdge,
        top: screenshotTopVisisbleEdge,
      },
      clip: {
        left: elementRectInScreenshotCoords.left - screenshotLeftVisibleEdge,
        top: elementRectInScreenshotCoords.top - screenshotTopVisisbleEdge,
      },
    };
  }

  /**
   * @param {DOM} dom
   * @param {HTMLElement} maskEl
   * @param {{left: number, top: number}} positionClip
   * @param {LH.Artifacts.Rect} elementRectInScreenshotCoords
   * @param {Size} elementPreviewSizeInScreenshotCoords
   */
  static renderClipPath(dom, maskEl, positionClip,
      elementRectInScreenshotCoords, elementPreviewSizeInScreenshotCoords) {
    const clipId = `clip-${Util.getUniqueSuffix()}`;

    // option a...
    // const clipPathEl = dom.find('clipPath', maskEl);

    // option b...
    let ns = 'http://www.w3.org/2000/svg';
    // const clipPathEl = dom.createChildOf(dom.find('defs', maskEl), 'clipPath');
    // clipPathEl.setAttributeNS(ns, 'clipPathUnits', 'objectBoundingBox');

    // option c...
    // const clipPathEl = document.createElementNS(ns, 'clipPath');
    // clipPathEl.setAttributeNS(ns, 'clipPathUnits', 'objectBoundingBox');
    // dom.find('defs', maskEl).appendChild(clipPathEl);

    // option d...
    dom.find('svg', maskEl).remove(); // just start over.
    const svgEl = document.createElementNS(ns, 'svg');
    // svgEl.setAttributeNS(ns, 'height', '0');
    // svgEl.setAttributeNS(ns, 'width', '0');
    const defsEl = document.createElementNS(ns, 'defs');
    const clipPathEl = document.createElementNS(ns, 'clipPath');
    clipPathEl.setAttribute('clipPathUnits', 'objectBoundingBox');

    maskEl.append(svgEl);
    svgEl.append(defsEl);
    defsEl.append(clipPathEl);

    clipPathEl.id = clipId;
    maskEl.style.clipPath = `url(#${clipId})`;

    // Normalize values between 0-1.
    const top = positionClip.top / elementPreviewSizeInScreenshotCoords.height;
    const bottom =
      top + elementRectInScreenshotCoords.height / elementPreviewSizeInScreenshotCoords.height;
    const left = positionClip.left / elementPreviewSizeInScreenshotCoords.width;
    const right =
      left + elementRectInScreenshotCoords.width / elementPreviewSizeInScreenshotCoords.width;

    const polygonsPoints = [
      `0,0             1,0            1,${top}          0,${top}`,
      `0,${bottom}     1,${bottom}    1,1               0,1`,
      `0,${top}        ${left},${top} ${left},${bottom} 0,${bottom}`,
      `${right},${top} 1,${top}       1,${bottom}       ${right},${bottom}`,
    ];
    for (const points of polygonsPoints) {
      // dom.createChildOf(clipPathEl, 'polygon', undefined, {points});
      const polygonEl = document.createElementNS(ns, 'polygon');
      clipPathEl.append(polygonEl);
      polygonEl.setAttribute('points', points);
    }
    // Clip path doesn't work unless you do this ...
    // clipPathEl.innerHTML = clipPathEl.innerHTML;
  }

  /**
   * @param {DOM} dom
   * @param {LH.Artifacts.FullPageScreenshot} fullPageScreenshot
   */
  static createBackgroundImageStyle(dom, fullPageScreenshot) {
    const styleEl = dom.createElement('style');
    styleEl.id = 'full-page-screenshot-style';
    styleEl.innerText = `
      .lh-element-screenshot__image {
        background-image: url(${fullPageScreenshot.data})
      }`;
    return styleEl;
  }

  /**
   * Installs the lightbox elements and wires up click listeners to all .lh-element-screenshot elements.
   * Should only be called exactly once per report render.
   * @param {DOM} dom
   * @param {ParentNode} templateContext
   * @param {LH.Artifacts.FullPageScreenshot} fullPageScreenshot
   */
  static installOverlayFeature(dom, templateContext, fullPageScreenshot) {
    const reportEl = dom.find('.lh-report', dom.document());
    reportEl.classList.add('lh-feature-screenshot-overlay');
    const renderContainerSizeInDisplayCoords = {
      width: dom.document().documentElement.clientWidth - reportEl.getBoundingClientRect().left,
      height: dom.document().documentElement.clientHeight - reportEl.getBoundingClientRect().top,
    };
    for (const el of dom.document().querySelectorAll('.lh-element-screenshot')) {
      el.addEventListener('click', () => {
        const overlay = dom.createElement('div');
        overlay.classList.add('lh-element-screenshot__overlay');
        const elementRectInScreenshotCoords = {
          width: Number(el.getAttribute('rectWidth')),
          height: Number(el.getAttribute('rectHeight')),
          left: Number(el.getAttribute('rectLeft')),
          right: Number(el.getAttribute('rectLeft')) + Number(el.getAttribute('rectWidth')),
          top: Number(el.getAttribute('rectTop')),
          bottom: Number(el.getAttribute('rectTop')) + Number(el.getAttribute('rectHeight')),
        };
        overlay.appendChild(ElementScreenshotRenderer.render(
          dom,
          templateContext,
          fullPageScreenshot,
          elementRectInScreenshotCoords,
          renderContainerSizeInDisplayCoords
        ));
        overlay.addEventListener('click', () => {
          overlay.remove();
        });

        reportEl.appendChild(overlay);
      });
    }
  }

  /**
   * Given the size of the element in the screenshot and the total available size of our preview container,
   * compute the factor by which we need to zoom out to view the entire element with context.
   * @param {LH.Artifacts.Rect} elementRectInScreenshotCoords
   * @param {Size} renderContainerSizeInDisplayCoords
   * @return {number}
   */
  static _computeZoomFactor(elementRectInScreenshotCoords, renderContainerSizeInDisplayCoords) {
    const targetClipToViewportRatio = 0.75;
    const zoomRatioXY = {
      x: renderContainerSizeInDisplayCoords.width / elementRectInScreenshotCoords.width,
      y: renderContainerSizeInDisplayCoords.height / elementRectInScreenshotCoords.height,
    };
    const zoomFactor = targetClipToViewportRatio * Math.min(zoomRatioXY.x, zoomRatioXY.y);
    return Math.min(1, zoomFactor);
  }

  /**
   * Renders an element with surrounding context from the full page screenshot.
   * Used to render both the thumbnail preview in details tables and the full-page screenshot in the lightbox.
   * @param {DOM} dom
   * @param {ParentNode} templateContext
   * @param {LH.Artifacts.FullPageScreenshot} fullPageScreenshot
   * @param {LH.Artifacts.Rect} elementRectInScreenshotCoords Region of screenshot to highlight.
   * @param {Size} renderContainerSizeInDisplayCoords
   * @return {Element}
   */
  static render(dom, templateContext, fullPageScreenshot, elementRectInScreenshotCoords,
      renderContainerSizeInDisplayCoords) {
    const tmpl = dom.cloneTemplate('#tmpl-lh-element-screenshot', templateContext);
    const containerEl = dom.find('.lh-element-screenshot', tmpl);

    containerEl.setAttribute('rectWidth', elementRectInScreenshotCoords.width.toString());
    containerEl.setAttribute('rectHeight', elementRectInScreenshotCoords.height.toString());
    containerEl.setAttribute('rectLeft', elementRectInScreenshotCoords.left.toString());
    containerEl.setAttribute('rectTop', elementRectInScreenshotCoords.top.toString());

    // Zoom out when highlighted region takes up most of the viewport.
    // This provides more context for where on the page this element is.
    const zoomFactor =
      this._computeZoomFactor(elementRectInScreenshotCoords, renderContainerSizeInDisplayCoords);

    const elementPreviewSizeInScreenshotCoords = {
      width: renderContainerSizeInDisplayCoords.width / zoomFactor,
      height: renderContainerSizeInDisplayCoords.height / zoomFactor,
    };
    elementPreviewSizeInScreenshotCoords.width =
      Math.min(fullPageScreenshot.width, elementPreviewSizeInScreenshotCoords.width);
    const elementPreviewSizeInDisplayCoords = {
      width: elementPreviewSizeInScreenshotCoords.width * zoomFactor,
      height: elementPreviewSizeInScreenshotCoords.height * zoomFactor,
    };

    const positions = ElementScreenshotRenderer.getScreenshotPositions(
      elementRectInScreenshotCoords,
      elementPreviewSizeInScreenshotCoords,
      {width: fullPageScreenshot.width, height: fullPageScreenshot.height}
    );

    const contentEl = dom.find('.lh-element-screenshot__content', containerEl);
    contentEl.style.top = `-${elementPreviewSizeInDisplayCoords.height}px`;

    const imageEl = dom.find('.lh-element-screenshot__image', containerEl);
    imageEl.style.width = elementPreviewSizeInDisplayCoords.width + 'px';
    imageEl.style.height = elementPreviewSizeInDisplayCoords.height + 'px';

    imageEl.style.backgroundPositionY = -(positions.screenshot.top * zoomFactor) + 'px';
    imageEl.style.backgroundPositionX = -(positions.screenshot.left * zoomFactor) + 'px';
    imageEl.style.backgroundSize =
      `${fullPageScreenshot.width * zoomFactor}px ${fullPageScreenshot.height * zoomFactor}px`;

    const markerEl = dom.find('.lh-element-screenshot__element-marker', containerEl);
    markerEl.style.width = elementRectInScreenshotCoords.width * zoomFactor + 'px';
    markerEl.style.height = elementRectInScreenshotCoords.height * zoomFactor + 'px';
    markerEl.style.left = positions.clip.left * zoomFactor + 'px';
    markerEl.style.top = positions.clip.top * zoomFactor + 'px';

    const maskEl = dom.find('.lh-element-screenshot__mask', containerEl);
    maskEl.style.width = elementPreviewSizeInDisplayCoords.width + 'px';
    maskEl.style.height = elementPreviewSizeInDisplayCoords.height + 'px';

    ElementScreenshotRenderer.renderClipPath(dom, maskEl, positions.clip,
      elementRectInScreenshotCoords, elementPreviewSizeInScreenshotCoords);

    return containerEl;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ElementScreenshotRenderer;
} else {
  self.ElementScreenshotRenderer = ElementScreenshotRenderer;
}
