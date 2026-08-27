const puppeteer = require('puppeteer');
const fs = require('fs');

async function runTest() {
  const results = {
    pageAccessible: false,
    uploadButtonFound: false,
    uploadPanelOpen: false,
    certUploadFound: false,
    uploadAttempted: false,
    screenshots: [],
    consoleErrors: [],
    consoleMessages: []
  };

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 }
  });

  page.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text() };
    results.consoleMessages.push(entry);
    if (msg.type() === 'error') {
      results.consoleErrors.push(entry);
    }
  });

  page.on('pageerror', err => {
    results.consoleErrors.push({ type: 'pageerror', text: err.message });
  });

  try {
    console.log('Step 1: Navigating to http://localhost:16000/...');
    const response = await page.goto('http://localhost:16000/', {
      waitUntil: 'networkidle2',
      timeout: 15000
    });

    if (response && response.status() === 200) {
      results.pageAccessible = true;
      console.log('✓ Page is accessible (HTTP 200)');
    } else {
      console.log('✗ Page returned status:', response ? response.status() : 'no response');
    }

    await page.waitForTimeout(2000);

    const screenshot1 = '/workspace/screenshot-1-initial.png';
    await page.screenshot({ path: screenshot1, fullPage: true });
    results.screenshots.push(screenshot1);
    console.log('✓ Screenshot 1 saved:', screenshot1);

    console.log('\nStep 2: Analyzing page structure...');
    const pageInfo = await page.evaluate(() => {
      const info = {
        title: document.title,
        url: window.location.href,
        bodyText: document.body ? document.body.innerText.substring(0, 500) : 'no body',
        allButtons: [],
        allInputs: [],
        fileInputs: [],
        uploadRelated: [],
        hasUploadButton: false,
        hasUploadIcon: false,
        hasCertUpload: false
      };

      const buttons = document.querySelectorAll('button, [role="button"], .btn, .nav-btn');
      buttons.forEach((btn, i) => {
        const text = btn.textContent.trim();
        const classes = btn.className || '';
        const id = btn.id || '';
        if (text || classes.includes('upload') || id.includes('upload')) {
          info.allButtons.push({
            index: i,
            text: text.substring(0, 50),
            classes: classes.substring(0, 50),
            id: id,
            rect: btn.getBoundingClientRect()
          });
        }
        if (text.includes('上传') || text.includes('upload') || text.includes('📤') || text.includes('file')) {
          info.uploadRelated.push({
            type: 'button',
            text: text.substring(0, 100),
            classes: classes.substring(0, 50),
            id: id
          });
        }
      });

      const inputs = document.querySelectorAll('input[type="file"], input[type="text"], input[type="number"], textarea, select');
      inputs.forEach((input, i) => {
        info.allInputs.push({
          index: i,
          type: input.type || input.tagName,
          name: input.name || '',
          id: input.id || '',
          placeholder: input.placeholder || '',
          accept: input.accept || ''
        });
      });

      const fileInputs = document.querySelectorAll('input[type="file"]');
      fileInputs.forEach((input, i) => {
        info.fileInputs.push({
          index: i,
          name: input.name || '',
          id: input.id || '',
          accept: input.accept || '',
          multiple: input.multiple
        });
      });

      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const text = (el.textContent || '').trim();
        if (text.includes('上传') && el.children.length === 0 && el.tagName !== 'SCRIPT') {
          info.uploadRelated.push({
            type: 'text-element',
            tag: el.tagName,
            text: text.substring(0, 100),
            classes: (el.className || '').toString().substring(0, 50)
          });
        }
      });

      const hasUploadBtn = document.querySelector('[class*="upload"], [id*="upload"], [data-action*="upload"]');
      info.hasUploadButton = !!hasUploadBtn;
      
      const uploadIcon = Array.from(document.querySelectorAll('*')).find(el => {
        const text = (el.textContent || '').trim();
        return text === '📤' || (text.includes('📤') && text.length <= 5);
      });
      info.hasUploadIcon = !!uploadIcon;

      const certUpload = Array.from(document.querySelectorAll('*')).find(el => {
        const text = (el.textContent || '').trim();
        return text.includes('证书') && (text.includes('上传') || text.includes('证书'));
      });
      info.hasCertUpload = !!certUpload;

      return info;
    });

    console.log('Page Info:', JSON.stringify(pageInfo, null, 2));

    console.log('\nStep 3: Looking for upload button...');
    
    let uploadButton = null;
    
    const uploadCandidates = await page.evaluate(() => {
      const candidates = [];
      const allElements = document.querySelectorAll('button, [role="button"], [class*="btn"], [class*="button"]');
      allElements.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          candidates.push({
            index: i,
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().substring(0, 50),
            classes: (el.className || '').toString().substring(0, 50),
            id: el.id || '',
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            isVisible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight + 100
          });
        }
      });
      return candidates;
    });

    console.log('Interactive elements found:', uploadCandidates.length);
    uploadCandidates.forEach(c => {
      console.log(`  [${c.index}] <${c.tag}> "${c.text}" classes="${c.classes}" id="${c.id}" pos=(${c.x},${c.y}) size=(${c.width}x${c.height}) visible=${c.isVisible}`);
    });

    const backTopBtn = uploadCandidates.find(c => c.id === 'backTop');
    const uploadLikeElements = uploadCandidates.filter(c => 
      c.text.includes('上传') || 
      c.text.includes('📤') || 
      c.text.toLowerCase().includes('upload')
    );

    if (uploadLikeElements.length > 0) {
      console.log('Found upload-like elements:', uploadLikeElements.length);
      uploadLikeElements.forEach(el => console.log(`  ${JSON.stringify(el)}`));
      
      uploadButton = uploadLikeElements[0];
      results.uploadButtonFound = true;
    } else {
      console.log('No direct upload button found. Searching for alternatives...');
      
      const bottomRightElements = uploadCandidates.filter(c => 
        c.x > 800 && c.y > 600
      );
      console.log('Elements in bottom-right area:', bottomRightElements.length);
      bottomRightElements.forEach(el => console.log(`  ${JSON.stringify(el)}`));
      
      if (backTopBtn) {
        console.log('Found back-to-top button at bottom-right, but no upload button.');
      }
    }

    console.log('\nStep 4: Checking for upload/file panels...');
    const panelInfo = await page.evaluate(() => {
      const info = {
        fileInputs: [],
        uploadPanels: [],
        modalPanels: [],
        certRelatedElements: [],
        hasCertUploadBox: false
      };

      document.querySelectorAll('input[type="file"]').forEach((input, i) => {
        info.fileInputs.push({
          index: i,
          accept: input.accept || '',
          multiple: input.multiple,
          id: input.id || '',
          name: input.name || '',
          parentClass: (input.parentElement?.className || '').toString().substring(0, 100)
        });
      });

      const allDivs = document.querySelectorAll('div, section, aside, [class*="panel"], [class*="modal"], [class*="dialog"]');
      allDivs.forEach(div => {
        const text = (div.textContent || '').trim();
        const classes = (div.className || '').toString();
        if ((classes.includes('upload') || classes.includes('panel') || classes.includes('modal')) && text.length < 200) {
          info.uploadPanels.push({
            text: text.substring(0, 100),
            classes: classes.substring(0, 100),
            id: div.id || ''
          });
        }
      });

      const certElements = document.querySelectorAll('[class*="cert"], [class*="certificate"]');
      certElements.forEach(el => {
        info.certRelatedElements.push({
          tag: el.tagName,
          text: (el.textContent || '').trim().substring(0, 100),
          classes: (el.className || '').toString().substring(0, 100)
        });
      });

      const certBoxes = document.querySelectorAll('[class*="cert-box"], [class*="cert-upload"], [class*="upload-slot"]');
      info.hasCertUploadBox = certBoxes.length > 0;

      return info;
    });

    console.log('Panel Info:', JSON.stringify(panelInfo, null, 2));

    console.log('\nStep 5: Attempting upload...');
    
    if (uploadButton && uploadButton.index !== undefined) {
      try {
        const selector = uploadButton.id ? `#${uploadButton.id}` : 
          (uploadButton.classes ? `.${uploadButton.classes.split(' ')[0]}` : null);
        
        if (selector) {
          console.log(`Clicking upload button with selector: ${selector}`);
          await page.click(selector);
          results.uploadPanelOpen = true;
          await page.waitForTimeout(1000);

          const screenshot2 = '/workspace/screenshot-2-after-click.png';
          await page.screenshot({ path: screenshot2, fullPage: true });
          results.screenshots.push(screenshot2);
        }
      } catch (e) {
        console.log('Could not click upload button:', e.message);
        
        try {
          await page.evaluate((idx) => {
            const buttons = document.querySelectorAll('button, [role="button"], [class*="btn"]');
            if (buttons[idx]) {
              buttons[idx].click();
            }
          }, uploadButton.index);
          results.uploadPanelOpen = true;
          await page.waitForTimeout(1000);
        } catch (e2) {
          console.log('Fallback click also failed:', e2.message);
        }
      }
    } else {
      console.log('No upload button to click. Checking for file inputs directly...');
    }

    if (panelInfo.fileInputs && panelInfo.fileInputs.length > 0) {
      results.certUploadFound = true;
      
      const firstFileInput = await page.$('input[type="file"]');
      if (firstFileInput) {
        try {
          await firstFileInput.uploadFile('/workspace/test-image.png');
          results.uploadAttempted = true;
          console.log('✓ Upload attempted on first file input');
          await page.waitForTimeout(1000);

          const screenshot3 = '/workspace/screenshot-3-after-upload.png';
          await page.screenshot({ path: screenshot3, fullPage: true });
          results.screenshots.push(screenshot3);
        } catch (e) {
          console.log('Upload failed:', e.message);
        }
      }
    } else {
      console.log('No file inputs found on the page.');
    }

    console.log('\nStep 6: Taking final screenshots...');
    const screenshotFinal = '/workspace/screenshot-final.png';
    await page.screenshot({ path: screenshotFinal, fullPage: true });
    results.screenshots.push(screenshotFinal);
    console.log('✓ Final screenshot saved:', screenshotFinal);

    const consoleErrors = await page.evaluate(() => {
      return window.__console_errors || [];
    });

    console.log('\n=== Test Results ===');
    console.log(JSON.stringify(results, null, 2));

    const report = {
      testTime: new Date().toISOString(),
      url: 'http://localhost:16000/',
      pageAccessible: results.pageAccessible,
      uploadButtonFound: results.uploadButtonFound,
      uploadPanelOpen: results.uploadPanelOpen,
      certUploadFound: results.certUploadFound,
      uploadAttempted: results.uploadAttempted,
      screenshots: results.screenshots,
      consoleErrorCount: results.consoleErrors.length,
      consoleErrors: results.consoleErrors.map(e => e.text).slice(0, 10),
      summary: generateSummary(results, pageInfo, panelInfo)
    };

    fs.writeFileSync('/workspace/test-results.json', JSON.stringify(report, null, 2));
    console.log('\n✓ Test results saved to /workspace/test-results.json');

  } catch (error) {
    console.error('Test failed with error:', error.message);
    console.error(error.stack);
    fs.writeFileSync('/workspace/test-results.json', JSON.stringify({
      testTime: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    }, null, 2));
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

function generateSummary(results, pageInfo, panelInfo) {
  const issues = [];
  
  if (!results.pageAccessible) {
    issues.push('页面无法访问');
  }
  if (!results.uploadButtonFound) {
    issues.push('未找到上传按钮');
  }
  if (!results.certUploadFound) {
    issues.push('未找到证书上传框');
  }
  if (results.consoleErrors.length > 0) {
    issues.push(`JavaScript 控制台有 ${results.consoleErrors.length} 个错误`);
  }
  
  if (issues.length === 0) {
    return {
      status: 'PASS',
      message: '页面正常显示，上传按钮可用，无 JavaScript 错误',
      details: '所有测试项均通过'
    };
  } else {
    return {
      status: issues.length <= 2 ? 'PARTIAL' : 'FAIL',
      message: issues.length <= 2 ? '部分功能异常' : '测试失败',
      issues: issues,
      details: `共发现 ${issues.length} 个问题`
    };
  }
}

runTest();
