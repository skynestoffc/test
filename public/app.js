document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const imagePreview = document.getElementById('image-preview');
    const removeBtn = document.getElementById('remove-btn');
    const processBtn = document.getElementById('process-btn');
    const loader = document.querySelector('.loader');
    const btnText = document.querySelector('.btn-text');
    
    // Modal elements
    const modal = document.getElementById('result-modal');
    const closeModal = document.querySelector('.close-modal');
    const resultImage = document.getElementById('result-image');
    const downloadBtn = document.getElementById('download-btn');

    let currentFile = null;

    // Handle File Selection
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    // Drag and Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('active');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('active'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('active');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file');
            return;
        }
        currentFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            dropZone.classList.add('hidden');
            previewContainer.classList.remove('hidden');
            processBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    }

    removeBtn.addEventListener('click', () => {
        currentFile = null;
        fileInput.value = '';
        dropZone.classList.remove('hidden');
        previewContainer.classList.add('hidden');
        processBtn.disabled = true;
    });

    // Process Image
    processBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        setLoading(true);

        const type = document.querySelector('input[name="type"]:checked').value;
        const scale = document.querySelector('input[name="scale"]:checked').value;

        // Convert file to Base64
        const reader = new FileReader();
        reader.readAsDataURL(currentFile);
        reader.onloadend = async () => {
            const base64data = reader.result;

            try {
                // Call Vercel Backend
                const response = await fetch('/api', { // Maps to api/index.js
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageBase64: base64data,
                        type: type,
                        scale: scale
                    })
                });

                const data = await response.json();

                if (data.success) {
                    showResult(data.url);
                } else {
                    alert('Error: ' + data.error);
                }
            } catch (error) {
                alert('Something went wrong. Please try again.');
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
    });

    function setLoading(isLoading) {
        if (isLoading) {
            processBtn.disabled = true;
            btnText.classList.add('hidden');
            loader.classList.remove('hidden');
        } else {
            processBtn.disabled = false;
            btnText.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    }

    function showResult(url) {
        resultImage.src = url;
        downloadBtn.href = url;
        modal.classList.remove('hidden');
    }

    closeModal.addEventListener('click', () => modal.classList.add('hidden'));
    
    // Close modal on outside click
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.classList.add('hidden');
        }
    }
});
