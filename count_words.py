
import os
import re

def count_words(text):
    # Remove markdown headers and other common artifacts if necessary
    # But for a simple novel count, we usually just count the characters in the body.
    # Let's count:
    # 1. Every Chinese character
    # 2. Every punctuation mark
    # 3. Every word for English (sequences of letters/numbers)
    
    # Simple approach: Count all non-whitespace characters
    # This is a common way to count "字數" in Chinese novel platforms.
    return len(re.findall(r'\S', text))

def main():
    base_dir = r'd:\專案\novel_Ratforge\章稿'
    threshold = 3000
    results = []

    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if file.endswith('.md'):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        count = count_words(content)
                        if count < threshold:
                            rel_path = os.path.relpath(file_path, base_dir)
                            results.append((rel_path, count))
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")

    # Sort results by count ascending
    results.sort(key=lambda x: x[1])

    print(f"{'章節':<50} | {'字數':<10}")
    print("-" * 65)
    for path, count in results:
        print(f"{path:<50} | {count:<10}")

if __name__ == "__main__":
    main()
