import { useRef, useCallback } from 'react';

/**
 * Custom hook to handle Excel operations in a Web Worker
 * Prevents UI freezing during large file operations
 */
export function useExcelWorker() {
  const workerRef = useRef(null);

  const initWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker('/excel-worker.js');
    }
    return workerRef.current;
  }, []);

  const parseExcel = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const worker = initWorker();

      const reader = new FileReader();

      reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);

        worker.onmessage = (event) => {
          if (event.data.type === 'PARSE_SUCCESS') {
            resolve(event.data.rows);
          } else if (event.data.type === 'ERROR') {
            reject(new Error(event.data.error));
          }
        };

        worker.onerror = (error) => {
          reject(error);
        };

        worker.postMessage({
          type: 'PARSE_EXCEL',
          data: data
        });
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsArrayBuffer(file);
    });
  }, [initWorker]);

  const exportExcel = useCallback((sheets, fileName) => {
    return new Promise((resolve, reject) => {
      const worker = initWorker();

      worker.onmessage = (event) => {
        if (event.data.type === 'EXPORT_SUCCESS') {
          // Create blob and download
          const blob = new Blob([event.data.data], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });

          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = event.data.fileName;
          a.click();
          URL.revokeObjectURL(url);

          resolve();
        } else if (event.data.type === 'ERROR') {
          reject(new Error(event.data.error));
        }
      };

      worker.onerror = (error) => {
        reject(error);
      };

      worker.postMessage({
        type: 'EXPORT_EXCEL',
        data: {
          sheets: sheets,
          fileName: fileName
        }
      });
    });
  }, [initWorker]);

  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  return {
    parseExcel,
    exportExcel,
    terminateWorker
  };
}
