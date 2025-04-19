from flask import Flask, request, jsonify
import os
from flask_cors import CORS
import json
from hints import generate_and_evaluate_hints

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Create directories for storing files
SAVE_DIR = 'codeforces_data'
if not os.path.exists(SAVE_DIR):
    os.makedirs(SAVE_DIR)

# Track problem data for hint generation
problem_data = {}

@app.route('/save-data', methods=['POST'])
def save_data():
    if not request.is_json:
        return jsonify({'error': 'Request must be JSON'}), 400
    
    data = request.json
    
    if not all(key in data for key in ['type', 'problemCode', 'content']):
        return jsonify({'error': 'Missing required fields'}), 400
    
    problem_code = data['problemCode']
    file_type = data['type']
    extension = 'html' if 'html' in file_type else 'txt'
    filename = f"{file_type}.{extension}"
    
    problem_dir = os.path.join(SAVE_DIR, problem_code)
    if not os.path.exists(problem_dir):
        os.makedirs(problem_dir)

    filepath = os.path.join(problem_dir, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(data['content'])

    if problem_code not in problem_data:
        problem_data[problem_code] = {}

    if file_type == 'problem':
        problem_data[problem_code]['problem'] = data['content']
    elif file_type == 'tutorial_clean':
        problem_data[problem_code]['solution'] = data['content']

    if 'problem' in problem_data[problem_code] and 'solution' in problem_data[problem_code]:
        try:
            problem_text = problem_data[problem_code]['problem']
            solution_text = problem_data[problem_code]['solution']
            hints = generate_and_evaluate_hints(problem_text, solution_text)

            hints_filepath = os.path.join(problem_dir, 'hints.json')
            with open(hints_filepath, 'w', encoding='utf-8') as f:
                json.dump({'hints': hints}, f, indent=2)

            print(f"✅ Generated hints for problem {problem_code}")

            # Clean up temporary files but keep the hints.json
            for filename in os.listdir(problem_dir):
                file_path = os.path.join(problem_dir, filename)
                if filename != 'hints.json':
                    try:
                        os.remove(file_path)
                    except Exception as e:
                        print(f"❌ Error deleting file {file_path}: {e}")

        except Exception as e:
            print(f"❌ Error generating hints: {e}")
    
    return jsonify({
        'success': True,
        'message': f'File saved: {filepath}',
        'problemCode': problem_code,
        'type': file_type
    })

@app.route('/check-hints', methods=['GET'])
def check_hints():
    problem_code = request.args.get('problemCode')
    if not problem_code:
        return jsonify({'error': 'Missing problemCode parameter'}), 400
    
    hints_file = os.path.join(SAVE_DIR, problem_code, 'hints.json')
    hints_available = os.path.exists(hints_file)
    
    return jsonify({
        'problemCode': problem_code,
        'hintsAvailable': hints_available
    })

@app.route('/get-hints', methods=['GET'])
def get_hints():
    problem_code = request.args.get('problemCode')
    if not problem_code:
        return jsonify({'error': 'Missing problemCode parameter'}), 400
    
    hints_file = os.path.join(SAVE_DIR, problem_code, 'hints.json')
    
    if not os.path.exists(hints_file):
        return jsonify({
            'error': 'Hints not found for this problem',
            'problemCode': problem_code
        }), 404
    
    try:
        with open(hints_file, 'r', encoding='utf-8') as f:
            hints_data = json.load(f)
        
        return jsonify({
            'problemCode': problem_code,
            'hints': hints_data.get('hints', [])
        })
    except Exception as e:
        return jsonify({
            'error': f'Error reading hints file: {str(e)}',
            'problemCode': problem_code
        }), 500

@app.route('/status', methods=['GET'])
def status():
    return jsonify({
        'status': 'online',
        'message': 'Codeforces Hint Helper server is running'
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)