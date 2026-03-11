// api/index.js
const axios = require('axios');
const FormData = require('form-data');

// Fungsi asli dari kamu, dibungkus ulang
async function imglarger(buffer, options = {}) {
    const { scale = '2', type = 'upscale' } = options;
    
    const config = {
        scales: ['2', '4'],
        types: { upscale: 13, enhance: 2, sharpener: 1 }
    };
    
    if (!Buffer.isBuffer(buffer)) throw new Error('Image buffer is required');
    if (!config.types[type]) throw new Error(`Available types: ${Object.keys(config.types).join(', ')}`);
    if (type === 'upscale' && !config.scales.includes(scale.toString())) throw new Error(`Available scales: ${config.scales.join(', ')}`);
    
    try {
        const form = new FormData();
        form.append('file', buffer, `upload_${Date.now()}.jpg`);
        form.append('type', config.types[type].toString());
        if (!['sharpener'].includes(type)) form.append('scaleRadio', type === 'upscale' ? scale.toString() : '1');
        
        const { data: p } = await axios.post('https://photoai.imglarger.com/api/PhoAi/Upload', form, {
            headers: {
                ...form.getHeaders(),
                accept: 'application/json, text/plain, */*',
                origin: 'https://imglarger.com',
                referer: 'https://imglarger.com/',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
            }
        });
        
        if (!p.data.code) throw new Error('Upload failed - API returned no code');
        
        // Polling loop
        let attempts = 0;
        while (attempts < 30) { // Limit attempts to avoid serverless timeout loop
            attempts++;
            const { data: r } = await axios.post('https://photoai.imglarger.com/api/PhoAi/CheckStatus', {
                code: p.data.code,
                type: config.types[type]
            }, {
                headers: {
                    accept: 'application/json, text/plain, */*',
                    'content-type': 'application/json',
                    origin: 'https://imglarger.com',
                    referer: 'https://imglarger.com/',
                    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
                }
            });
            
            if (r.data.status === 'success') return r.data.downloadUrls[0];
            if (r.data.status === 'waiting') {
                await new Promise(res => setTimeout(res, 2000)); // Wait 2s
                continue;
            }
            throw new Error('Processing failed or unknown status');
        }
        throw new Error('Timeout: Image took too long to process');

    } catch (error) {
        throw error;
    }
}

// Vercel Serverless Handler
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { imageBase64, scale, type } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ error: 'No image provided' });
        }

        // Convert Base64 back to Buffer
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        const resultUrl = await imglarger(buffer, { scale, type });
        
        return res.status(200).json({ success: true, url: resultUrl });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
