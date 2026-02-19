
import os
import re

def count_words(text):
    return len(re.findall(r'\S', text))

def scan_volume(dir_path):
    results = []
    for root, _, files in os.walk(dir_path):
        for file in files:
            if file.endswith(".md"):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        word_count = count_words(content)
                        results.append((file, word_count, file_path))
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")
    return results

if __name__ == "__main__":
    vol9_path = r"d:\專案\novel_Ratforge\章稿\S2-深淵篇\第9卷_墜落地"
    chapters = scan_volume(vol9_path)
    # Sort by word count ascending
    chapters.sort(key=lambda x: x[1])
    
    print(f"{'Word Count':<10} | {'Chapter Name'}")
    print("-" * 50)
    for name, count, _ in chapters:
        print(f"{count:<10} | {name}")
