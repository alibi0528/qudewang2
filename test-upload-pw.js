const { chromium } = require('playwright');
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

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

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
      waitUntil: 'networkidle',
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
    
    const uploadBtn = page.getByRole('button', { name: '📤' });
    const uploadBtnCount = await uploadBtn.count();
    
    if (uploadBtnCount > 0) {
      results.uploadButtonFound = true;
      console.log('✓ Upload button (📤) found on page');
      
      const btnInfo = await uploadBtn.first().evaluate(el => ({
        text: el.textContent.trim(),
        title: el.title || '',
        classes: el.className,
        rect: el.getBoundingClientRect()
      }));
      console.log('  Button info:', JSON.stringify(btnInfo));
    } else {
      console.log('✗ Upload button (📤) not found');
    }

    console.log('\nStep 3: Clicking upload button...');
    if (results.uploadButtonFound) {
      await uploadBtn.first().click();
      results.uploadPanelOpen = true;
      console.log('✓ Upload button clicked');
      await page.waitForTimeout(1000);

      const screenshot2 = '/workspace/screenshot-2-after-click.png';
      await page.screenshot({ path: screenshot2, fullPage: true });
      results.screenshots.push(screenshot2);
      console.log('✓ Screenshot 2 saved:', screenshot2);
    }

    console.log('\nStep 4: Checking for upload panel and certificate upload boxes...');
    
    const panelInfo = await page.evaluate(() => {
      const info = {
        fileInputs: [],
        certUploadBoxes: [],
        panels: [],
        dialogs: [],
        allInputs: []
      };

      document.querySelectorAll('input[type="file"]').forEach((input, i) => {
        info.fileInputs.push({
          index: i,
          accept: input.accept || '',
          multiple: input.multiple,
          id: input.id || '',
          name: input.name || '',
          parentHTML: input.parentElement?.outerHTML?.substring(0, 200) || ''
        });
      });

      document.querySelectorAll('input, textarea, select').forEach((input, i) => {
        info.allInputs.push({
          index: i,
          type: input.type || input.tagName.toLowerCase(),
          id: input.id || '',
          name: input.name || '',
          placeholder: input.placeholder || '',
          accept: input.accept || ''
        });
      });

      const certBoxes = document.querySelectorAll('[class*="cert-upload"], [class*="cert-box"], [class*="upload-slot"], [data-slot], [class*="upload-panel"]');
      certBoxes.forEach(el => {
        info.certUploadBoxes.push({
          tag: el.tagName,
          classes: el.className,
          text: (el.textContent || '').trim().substring(0, 100)
        });
      });

      const panels = document.querySelectorAll('[class*="panel"], [class*="modal"], [class*="dialog"], [class*="upload"]');
      panels.forEach(el => {
        if (el.children.length < 10) {
          info.panels.push({
            tag: el.tagName,
            classes: (el.className || '').toString().substring(0, 100),
            text: (el.textContent || '').trim().substring(0, 100)
          });
        }
      });

      return info;
    });

    console.log('Panel Info:', JSON.stringify(panelInfo, null, 2));

    if (panelInfo.fileInputs.length > 0) {
      results.certUploadFound = true;
      console.log(`✓ Found ${panelInfo.fileInputs.length} file input(s)`);
      
      console.log('\nStep 5: Attempting to upload test image to first file input...');
      const firstFileInput = page.locator('input[type="file"]').first();
      
      try {
        await firstFileInput.setInputFiles('/workspace/test-image.png');
        results.uploadAttempted = true;
        console.log('✓ Upload attempted successfully');
        await page.waitForTimeout(1000);

        const screenshot3 = '/workspace/screenshot-3-after-upload.png';
        await page.screenshot({ path: screenshot3, fullPage: true });
        results.screenshots.push(screenshot3);
        console.log('✓ Screenshot 3 saved:', screenshot3);
      } catch (e) {
        console.log('✗ Upload failed:', e.message);
      }
    } else {
      console.log('✗ No file inputs found on the page');
    }

    console.log('\nStep 6: Taking final screenshot...');
    const screenshotFinal = '/workspace/screenshot-final.png';
    await page.screenshot({ path: screenshotFinal, fullPage: true });
    results.screenshots.push(screenshotFinal);
    console.log('✓ Final screenshot saved:', screenshotFinal);

    console.log('\nStep 7: Checking console for JavaScript errors...');
    console.log('Console messages:', results.consoleMessages.length);
    console.log('Console errors:', results.consoleErrors.length);
    if (results.consoleErrors.length > 0) {
      results.consoleErrors.forEach(err => {
        console.log('  Error:', err.text.substring(0, 200));
      });
    }

    console.log('\n=== Test Results ===');
    console.log(JSON.stringify(results, null, 2));

    const summary = generateSummary(results, panelInfo);
    
    const report = {
      testTime: new Date().toISOString(),
      url: 'http://localhost:16000/',
      ...results,
      summary: summary
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

function generateSummary(results, panelInfo) {
  const issues = [];
  
  if (!results.pageAccessible) {
    issues.push('页面无法访问');
  }
  if (!results.uploadButtonFound) {
    issues.push('未找到上传按钮 (📤)');
  }
  if (results.uploadButtonFound && !results.uploadPanelOpen) {
    issues.push('上传面板未打开');
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
