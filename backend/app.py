from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from PIL import Image
import io
import hashlib
import base64
from cryptography.fernet import Fernet, InvalidToken

app = Flask(__name__)
CORS(app)

def get_fernet(password):
    # Hash password to a consistent 32 bytes and base64 format it for Fernet
    digest = hashlib.sha256(password.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))

@app.route('/', methods=['GET'])
def home():
    return "SecretLens Backend is running! Please access the React frontend at http://localhost:5173"

def text_to_binary(message):
    return ''.join(format(ord(i), '08b') for i in message)

def encode_lsb(image, secret_msg):
    # Convert message to binary and append the 16-bit strong end marker
    binary_msg = text_to_binary(secret_msg) + '1111111111111110'
    
    # Ensure image is in RGB format for consistent 3-channel processing
    if image.mode != 'RGB':
        image = image.convert('RGB')
        
    pixels = list(image.getdata())
    encoded_pixels = []
    
    msg_idx = 0
    for i, pixel in enumerate(pixels):
        if msg_idx >= len(binary_msg):
            # Stop modifying pixels once full message + end marker is embedded
            encoded_pixels.extend(pixels[i:])
            break
            
        new_pixel = []
        for color_channel in range(3): # Process R, G, and B
            if msg_idx < len(binary_msg):
                # Clear the least significant bit and set it to the current bit of the message
                new_channel_val = (pixel[color_channel] & ~1) | int(binary_msg[msg_idx])
                new_pixel.append(new_channel_val)
                msg_idx += 1
            else:
                new_pixel.append(pixel[color_channel])
        encoded_pixels.append(tuple(new_pixel))

    encoded_img = Image.new(image.mode, image.size)
    encoded_img.putdata(encoded_pixels)
    return encoded_img

# Decode logic moved directly into route

@app.route('/encode', methods=['POST'])
def encode_image():
    if 'image' not in request.files or 'message' not in request.form or 'password' not in request.form:
        return jsonify({'error': 'Image file, message, and password are required.'}), 400
        
    file = request.files['image']
    message = request.form['message']
    password = request.form['password']
    
    if file.filename == '' or not message or not password:
        return jsonify({'error': 'Missing file, empty message, or empty password.'}), 400

    try:
        f = get_fernet(password)
        # Encrypt the message before embedding it
        encrypted_message = f.encrypt(message.encode()).decode('utf-8')
        
        image = Image.open(file.stream)
        
        # Check capacity: 3 bits per pixel
        max_bytes = (image.width * image.height * 3) // 8
        if len(encrypted_message) + 2 > max_bytes: # +2 for markers roughly
            return jsonify({'error': f'Message is too long. Max characters: {max_bytes - 2}'}), 400
            
        encoded_img = encode_lsb(image, encrypted_message)
        
        # Save securely to memory buffer as PNG (lossless format is crucial for LSB to survive)
        img_byte_arr = io.BytesIO()
        encoded_img.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)
        
        return send_file(
            img_byte_arr,
            mimetype='image/png',
            as_attachment=True,
            download_name='encoded_image.png'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/decode', methods=['POST'])
def decode():
    from PIL import Image

    if 'image' not in request.files or 'password' not in request.form:
        return jsonify({'error': 'Image file and password are required.'}), 400

    file = request.files['image']
    password = request.form['password']
    
    if file.filename == '' or not password:
        return jsonify({'error': 'Missing file or empty password.'}), 400

    try:
        img = Image.open(file)
    except Exception:
        return jsonify({'error': 'Invalid image file.'}), 400
        
    data = list(img.getdata())

    binary_data = ""

    for pixel in data:
        for value in pixel[:3]:
            binary_data += str(value & 1)

    # Read in 8-bit chunks
    bytes_data = [binary_data[i:i+8] for i in range(0, len(binary_data), 8)]

    message = ""
    end_marker = '1111111111111110'

    full_binary = ""

    for byte in bytes_data:
        full_binary += byte
        if end_marker in full_binary:
            break

    # Remove end marker
    full_binary = full_binary.replace(end_marker, "")

    # Convert to text
    for i in range(0, len(full_binary), 8):
        byte = full_binary[i:i+8]
        if len(byte) < 8:
            continue
        try:
            message += chr(int(byte, 2))
        except ValueError:
            continue

    # Setup cryptography object
    f = get_fernet(password)
    
    try:
        # The steganography message string is ciphertext. Try to decrypt it.
        decrypted_message = f.decrypt(message.encode()).decode('utf-8')
    except InvalidToken:
        return jsonify({'error': 'Incorrect password or no hidden encrypted data found.'}), 400
    except Exception as e:
        return jsonify({'error': f'Decryption error: {str(e)}'}), 400

    return {"message": decrypted_message}

if __name__ == '__main__':
    app.run(port=5000, debug=True)
