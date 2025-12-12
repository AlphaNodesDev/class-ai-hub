#!/usr/bin/env python3
"""
Generate Questions from Video Transcript using AI
===================================================
Uses local AI models to generate relevant exam questions from video content.

Usage:
    python generate_questions.py transcript.txt --output questions.json

Requirements:
    pip install transformers torch

Uses T5 model for question generation from text.
"""

import argparse
import json
import sys
from pathlib import Path

# Try to import transformers, fallback to simple extraction if not available
try:
    from transformers import pipeline, T5ForConditionalGeneration, T5Tokenizer
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False
    print("Warning: transformers not installed. Using basic question extraction.")


def extract_key_sentences(text, max_sentences=20):
    """Extract key sentences that could form the basis of questions"""
    import re
    
    # Split into sentences
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 30]
    
    # Filter for sentences that contain key educational patterns
    key_patterns = [
        r'\b(is|are|was|were)\b.*\b(called|known|defined|described)\b',
        r'\b(formula|equation|principle|law|theory)\b',
        r'\b(example|for instance|such as)\b',
        r'\b(important|significant|key|main|primary)\b',
        r'\b(because|therefore|thus|hence|so)\b',
        r'\b(first|second|third|finally|step)\b',
        r'\b(calculate|compute|find|determine|solve)\b',
        r'\b(equal|equals|gives|results)\b',
    ]
    
    scored_sentences = []
    for sentence in sentences:
        score = 0
        lower = sentence.lower()
        for pattern in key_patterns:
            import re
            if re.search(pattern, lower):
                score += 1
        if score > 0:
            scored_sentences.append((sentence, score))
    
    # Sort by score and return top sentences
    scored_sentences.sort(key=lambda x: x[1], reverse=True)
    return [s[0] for s in scored_sentences[:max_sentences]]


def generate_questions_simple(text, num_questions=10):
    """Simple rule-based question generation"""
    import re
    
    questions = []
    key_sentences = extract_key_sentences(text, max_sentences=30)
    
    question_templates = [
        ("What is", r'\b(\w+)\s+(is|are)\s+(called|known as|defined as)\s+(.+)', 
         lambda m: f"What is {m.group(4).strip('.')}?"),
        ("Explain", r'\b(important|significant|key)\s+(\w+)', 
         lambda m: f"Explain the importance of {m.group(2)}."),
        ("What are", r'\b(types|kinds|forms)\s+of\s+(\w+)',
         lambda m: f"What are the different {m.group(1)} of {m.group(2)}?"),
        ("How", r'\b(calculate|compute|find|determine)\s+(.+)',
         lambda m: f"How do you {m.group(1)} {m.group(2).strip('.')}?"),
        ("Define", r'\b(\w+)\s+is\s+defined\s+as',
         lambda m: f"Define {m.group(1)}."),
        ("State", r'\b(law|principle|theorem|rule)\s+of\s+(\w+)',
         lambda m: f"State the {m.group(1)} of {m.group(2)}."),
    ]
    
    for sentence in key_sentences:
        for name, pattern, formatter in question_templates:
            match = re.search(pattern, sentence, re.IGNORECASE)
            if match:
                try:
                    question = formatter(match)
                    if question and len(question) > 10:
                        questions.append({
                            'question': question,
                            'type': name,
                            'source_sentence': sentence[:200],
                            'difficulty': 'medium'
                        })
                except:
                    pass
        
        if len(questions) >= num_questions:
            break
    
    # Add generic questions if we don't have enough
    if len(questions) < num_questions:
        # Extract key terms
        words = text.lower().split()
        word_freq = {}
        stopwords = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                     'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                     'should', 'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in',
                     'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
                     'and', 'but', 'or', 'nor', 'so', 'yet', 'this', 'that', 'these',
                     'those', 'it', 'its', 'they', 'them', 'their', 'we', 'our', 'you',
                     'your', 'i', 'me', 'my', 'he', 'him', 'his', 'she', 'her'}
        
        for word in words:
            word = re.sub(r'[^a-z]', '', word)
            if len(word) > 4 and word not in stopwords:
                word_freq[word] = word_freq.get(word, 0) + 1
        
        top_terms = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:10]
        
        for term, _ in top_terms:
            if len(questions) >= num_questions:
                break
            questions.append({
                'question': f"Explain the concept of {term} as discussed in the lecture.",
                'type': 'Explain',
                'source_sentence': '',
                'difficulty': 'medium'
            })
    
    return questions[:num_questions]


def generate_questions_ai(text, num_questions=10):
    """Use T5 model to generate questions from text"""
    if not HAS_TRANSFORMERS:
        return generate_questions_simple(text, num_questions)
    
    try:
        print("Loading T5 model for question generation...")
        
        # Use a smaller model for faster processing
        model_name = "valhalla/t5-small-qg-prepend"
        
        tokenizer = T5Tokenizer.from_pretrained(model_name)
        model = T5ForConditionalGeneration.from_pretrained(model_name)
        
        # Split text into chunks
        sentences = text.split('. ')
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            if len(current_chunk) + len(sentence) < 500:
                current_chunk += sentence + ". "
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence + ". "
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        questions = []
        
        for i, chunk in enumerate(chunks[:num_questions * 2]):
            if len(questions) >= num_questions:
                break
            
            try:
                # Prepare input for question generation
                input_text = f"generate question: {chunk}"
                
                inputs = tokenizer.encode(input_text, return_tensors="pt", max_length=512, truncation=True)
                
                outputs = model.generate(
                    inputs,
                    max_length=64,
                    num_beams=4,
                    early_stopping=True
                )
                
                question = tokenizer.decode(outputs[0], skip_special_tokens=True)
                
                if question and len(question) > 10 and '?' in question:
                    questions.append({
                        'question': question,
                        'type': 'AI Generated',
                        'source_sentence': chunk[:200],
                        'difficulty': 'medium'
                    })
                    print(f"  Generated: {question}")
            except Exception as e:
                print(f"  Error generating question: {e}")
                continue
        
        # Fill remaining with simple questions
        if len(questions) < num_questions:
            simple_qs = generate_questions_simple(text, num_questions - len(questions))
            questions.extend(simple_qs)
        
        return questions[:num_questions]
    
    except Exception as e:
        print(f"AI model error: {e}. Falling back to simple generation.")
        return generate_questions_simple(text, num_questions)


def main():
    parser = argparse.ArgumentParser(description='Generate questions from transcript')
    parser.add_argument('input_file', help='Path to transcript file (.txt or .srt)')
    parser.add_argument('--output', default=None, help='Output JSON file path')
    parser.add_argument('--num_questions', type=int, default=10, help='Number of questions to generate')
    parser.add_argument('--use_ai', action='store_true', help='Use AI model for question generation')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: File not found: {args.input_file}")
        sys.exit(1)
    
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_suffix('.questions.json')
    
    print("=" * 50)
    print("Class360 Question Generator")
    print("=" * 50)
    print(f"Input: {input_path}")
    print(f"Output: {output_path}")
    print(f"Questions: {args.num_questions}")
    print(f"AI Mode: {args.use_ai}")
    print("=" * 50)
    
    # Read transcript
    with open(input_path, 'r', encoding='utf-8', errors='replace') as f:
        text = f.read()
    
    # Clean SRT format if needed
    import re
    text = re.sub(r'\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n', '', text)
    text = re.sub(r'\n{2,}', ' ', text)
    
    print(f"Transcript length: {len(text)} characters")
    
    # Generate questions
    print("\nGenerating questions...")
    
    if args.use_ai and HAS_TRANSFORMERS:
        questions = generate_questions_ai(text, args.num_questions)
    else:
        questions = generate_questions_simple(text, args.num_questions)
    
    # Save to JSON
    output_data = {
        'video_id': input_path.stem,
        'generated_at': __import__('datetime').datetime.now().isoformat(),
        'num_questions': len(questions),
        'questions': questions
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
    
    print(f"\n" + "=" * 50)
    print(f"Generated {len(questions)} questions")
    print(f"Output saved: {output_path}")
    print("=" * 50)
    
    # Print questions
    print("\nGenerated Questions:")
    for i, q in enumerate(questions, 1):
        print(f"  {i}. {q['question']}")

if __name__ == '__main__':
    main()
