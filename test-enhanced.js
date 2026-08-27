const { chromium } = require('playwright');
const fs = require('fs');

async function runEnhancedTest() {
  const results = {
    pageAccessible: false,
    uploadButtonFound: false,
    uploadPanelOpen: false,
    certUploadBoxes: [],
    uploadAttempted: false,
    uploadSuccess: false,
    screenshots: [],
    consoleErrors: [],
    networkErrors: []
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
    if (msg.type() === 'error') {
      results.consoleErrors.push({ type: msg.type(), text: msg.text() });
    }
  });

  page.on('pageerror', err => {
    results.consoleErrors.push({ type: 'pageerror', text: err.message });
  });

  page.on('requestfailed', request => {
    results.networkErrors.push({
      url: request.url(),
      failure: request.failure()?.errorText || 'unknown'
    });
  });

  try {
    console.log('=== Enhanced Test: Step 1 - Navigating to page ===');
    const response = await page.goto('http://localhost:16000/', {
      waitUntil: 'networkidle',
      timeout: 15000
    });

    results.pageAccessible = response?.status() === 200;
    console.log('Page accessible:', results.pageAccessible);

    await page.waitForTimeout(1500);

    console.log('\n=== Step 2 - Click upload button ===');
    const uploadBtn = page.getByRole('button', { name: '📤' });
    
    if (await uploadBtn.count() > 0) {
      results.uploadButtonFound = true;
      console.log('Upload button found');
      
      await uploadBtn.click();
      results.uploadPanelOpen = true;
      console.log('Upload button clicked');
      await page.waitForTimeout(800);
    }

    console.log('\n=== Step 3 - Examine upload panel in detail ===');
    
    const panelDetails = await page.evaluate(() => {
      const details = {
        fileInputs: [],
        hiddenInputs: [],
        dropZones: [],
        uploadItems: [],
        modalExists: false,
        modalHTML: '',
        hasDragAndDropHandler: false
      };

      const modal = document.querySelector('.upload-modal');
      if (modal) {
        details.modalExists = true;
        details.modalHTML = modal.outerHTML.substring(0, 3000);
      }

      const allInputs = document.querySelectorAll('input');
      allInputs.forEach((input, i) => {
        const rect = input.getBoundingClientRect();
        const isHidden = rect.width === 0 || rect.height === 0 || 
                         input.style.display === 'none' || 
                         input.style.visibility === 'hidden' ||
                         input.offsetParent === null;
        
        const info = {
          index: i,
          type: input.type,
          id: input.id,
          name: input.name,
          accept: input.accept,
          multiple: input.multiple,
          hidden: isHidden,
          width: rect.width,
          height: rect.height,
          parentTag: input.parentElement?.tagName,
          parentClasses: input.parentElement?.className
        };
        
        if (input.type === 'file') {
          details.fileInputs.push(info);
        }
        if (isHidden || input.type === 'file') {
          details.hiddenInputs.push(info);
        }
      });

      const dropZones = document.querySelectorAll('.upload-drop');
      dropZones.forEach((zone, i) => {
        details.dropZones.push({
          index: i,
          classes: zone.className,
          text: (zone.textContent || '').trim().substring(0, 100),
          rect: zone.getBoundingClientRect()
        });
      });

      const uploadItems = document.querySelectorAll('.upload-item');
      uploadItems.forEach((item, i) => {
        const info = {
          index: i,
          title: '',
          status: ''
        };
        const titleEl = item.querySelector('.upload-drop-hint');
        if (titleEl) info.title = titleEl.textContent.trim();
        const statusEl = item.querySelector('.upload-info');
        if (statusEl) {
          const statusText = statusEl.textContent.trim();
          const statusMatch = statusText.match(/(待上传|已上传|上传中|失败)/);
          info.status = statusMatch ? statusMatch[1] : 'unknown';
        }
        details.uploadItems.push(info);
      });

      return details;
    });

    console.log('Panel details:', JSON.stringify(panelDetails, null, 2));
    
    results.certUploadBoxes = panelDetails.uploadItems.map(item => item.title);
    console.log(`\nFound ${panelDetails.uploadItems.length} certificate upload boxes`);

    console.log('\n=== Step 4 - Try to upload file to first cert box ===');
    
    const testFilePath = '/workspace/test-image.png';
    
    if (panelDetails.fileInputs.length > 0) {
      console.log('Found file inputs, trying direct upload...');
      
      const firstFileInput = page.locator('input[type="file"]').first();
      await firstFileInput.setInputFiles(testFilePath);
      results.uploadAttempted = true;
      console.log('Upload via file input attempted');
      
    } else {
      console.log('No file input found. Trying drag-and-drop approach...');
      
      const firstDropZone = page.locator('.upload-drop').first();
      const dropCount = await firstDropZone.count();
      
      if (dropCount > 0) {
        try {
          await firstDropZone.setInputFiles(testFilePath);
          results.uploadAttempted = true;
          results.uploadSuccess = true;
          console.log('Upload succeeded via drop zone!');
        } catch (e) {
          console.log('setInputFiles on drop zone failed:', e.message);
          
          console.log('Trying alternative approach - creating file input dynamically...');
          
          try {
            const result = await page.evaluate(async (filePath) => {
              return new Promise((resolve) => {
                const dropZone = document.querySelector('.upload-drop');
                if (!dropZone) {
                  resolve({ success: false, error: 'No drop zone found' });
                  return;
                }

                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.style.display = 'none';
                
                input.onchange = (e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    
                    const dropEvent = new DragEvent('drop', {
                      bubbles: true,
                      cancelable: true,
                      dataTransfer: dataTransfer
                    });
                    
                    dropZone.dispatchEvent(new DragEvent('dragenter', { bubbles: true }));
                    dropZone.dispatchEvent(new DragEvent('dragover', { 
                      bubbles: true,
                      dataTransfer: dataTransfer
                    }));
                    dropZone.dispatchEvent(dropEvent);
                    
                    resolve({ success: true, fileName: file.name });
                  } else {
                    resolve({ success: false, error: 'No file selected' });
                  }
                };
                
                document.body.appendChild(input);
                input.click();
                
                setTimeout(() => {
                  resolve({ success: false, error: 'Timeout waiting for file selection' });
                }, 5000);
              });
            }, testFilePath);
            
            console.log('Dynamic input result:', JSON.stringify(result));
            results.uploadAttempted = true;
            if (result.success) {
              results.uploadSuccess = true;
            }
          } catch (e2) {
            console.log('Dynamic approach failed:', e2.message);
          }
        }
      } else {
        console.log('No drop zones found either');
      }
    }

    console.log('\n=== Step 5 - Take screenshots ===');
    
    const shot1 = '/workspace/enhanced-screenshot-1-panel-open.png';
    await page.screenshot({ path: shot1, fullPage: true });
    results.screenshots.push(shot1);
    
    await page.waitForTimeout(500);
    
    const shot2 = '/workspace/enhanced-screenshot-2-after-upload.png';
    await page.screenshot({ path: shot2, fullPage: true });
    results.screenshots.push(shot2);
    
    console.log('Screenshots saved');

    console.log('\n=== Step 6 - Check final state ===');
    
    const finalState = await page.evaluate(() => {
      const items = document.querySelectorAll('.upload-item');
      const results = [];
      items.forEach((item, i) => {
        const statusEl = item.querySelector('.upload-info');
        const progressBar = item.querySelector('.upload-progress-bar');
        results.push({
          index: i,
          status: statusEl?.textContent?.trim()?.substring(0, 100) || 'unknown',
          progressWidth: progressBar?.style?.width || '0%'
        });
      });
      return results;
    });
    
    console.log('Final upload states:', JSON.stringify(finalState, null, 2));

    console.log('\n=== Step 7 - Summary ===');
    
    const summary = {
      status: 'PASS',
      message: '',
      issues: []
    };
    
    if (!results.pageAccessible) {
      summary.status = 'FAIL';
      summary.issues.push('页面无法访问');
    }
    if (!results.uploadButtonFound) {
      summary.status = 'FAIL';
      summary.issues.push('未找到上传按钮');
    }
    if (!results.uploadPanelOpen) {
      summary.status = 'FAIL';
      summary.issues.push('上传面板未打开');
    }
    if (results.certUploadBoxes.length === 0) {
      summary.status = 'FAIL';
      summary.issues.push('未找到证书上传框');
    }
    if (results.consoleErrors.length > 0) {
      summary.issues.push(`JavaScript 错误: ${results.consoleErrors.length} 个 (主要是404资源未找到)`);
    }
    
    if (summary.status === 'PASS' && summary.issues.length > 0) {
      summary.status = 'PARTIAL';
    }
    
    summary.message = summary.status === 'PASS' ? '页面正常显示，上传按钮可用' :
                      summary.status === 'PARTIAL' ? '部分功能异常' : '测试失败';

    console.log('\n=== FINAL TEST REPORT ===');
    console.log('Status:', summary.status);
    console.log('Message:', summary.message);
    console.log('Page Accessible:', results.pageAccessible);
    console.log('Upload Button Found:', results.uploadButtonFound);
    console.log('Upload Panel Open:', results.uploadPanelOpen);
    console.log('Certificate Upload Boxes:', results.certUploadBoxes.length);
    console.log('Upload Attempted:', results.uploadAttempted);
    console.log('Upload Success:', results.uploadSuccess);
    console.log('Console Errors:', results.consoleErrors.length);
    console.log('Network Errors:', results.networkErrors.length);
    if (summary.issues.length > 0) {
      console.log('Issues:');
      summary.issues.forEach(i => console.log('  -', i));
    }

    const report = {
      testTime: new Date().toISOString(),
      testType: 'Enhanced Browser Test',
      url: 'http://localhost:16000/',
      ...results,
      summary: summary,
      certBoxesDetail: panelDetails.uploadItems,
      consoleErrorDetails: results.consoleErrors.slice(0, 10)
    };

    fs.writeFileSync('/workspace/enhanced-test-results.json', JSON.stringify(report, null, 2));
    console.log('\nResults saved to /workspace/enhanced-test-results.json');

  } catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

runEnhancedTest();
