
import os
import re
import glob
import csv
from datetime import datetime

# --- Configuration ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # Root directory
CHAPTERS_DIR = os.path.join(BASE_DIR, "章稿")
OUTPUT_CSV = os.path.join(BASE_DIR, "scripts", "各章字數統計.csv")
THRESHOLD = 3000

def count_words(text):
    """
    Counts non-whitespace characters (common for Chinese novel word counts).
    """
    return len(re.findall(r'\S', text))

def get_chapter_files():
    """
    Recursively find all .md files in the chapters directory.
    """
    files = []
    for root, _, filenames in os.walk(CHAPTERS_DIR):
        for filename in filenames:
            if filename.endswith(".md"):
                files.append(os.path.join(root, filename))
    return files

def analyze_chapters(volume_limit=None, min_words=None):
    """
    Analyze chapters and return results.
    """
    files = get_chapter_files()
    results = []
    
    for filepath in files:
        rel_path = os.path.relpath(filepath, CHAPTERS_DIR)
        
        # Volume filtering
        if volume_limit:
            match = re.search(r'第(\d+)卷', rel_path)
            if match:
                vol_num = int(match.group(1))
                if vol_num < volume_limit:
                    continue
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                count = count_words(content)
                
                if min_words is not None:
                    if count >= min_words:
                        continue
                    
                results.append({
                    "path": rel_path,
                    "filename": os.path.basename(filepath),
                    "count": count,
                    "status": "OK" if count >= THRESHOLD else "LOW"
                })
        except Exception as e:
            print(f"Error reading {rel_path}: {e}")
            
    return sorted(results, key=lambda x: x["count"])

def export_to_csv(results):
    """
    Export results to the CSV file.
    """
    keys = ["path", "count", "status"]
    try:
        with open(OUTPUT_CSV, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            for r in results:
                writer.writerow({k: r[k] for k in keys})
        print(f"\n[成功] 已將統計結果匯出至: {OUTPUT_CSV}")
    except Exception as e:
        print(f"Error exporting CSV: {e}")

def main():
    print("="*50)
    print(" 📖 Ratforge 小說字數統計工具")
    print("="*50)
    print(f"掃描目錄: {CHAPTERS_DIR}")
    
    all_results = analyze_chapters()
    
    # 1. Summary
    total_chapters = len(all_results)
    low_chapters = [r for r in all_results if r["status"] == "LOW"]
    avg_words = sum(r["count"] for r in all_results) / total_chapters if total_chapters > 0 else 0
    
    print(f"總章數: {total_chapters}")
    print(f"平均字數: {avg_words:.0f}")
    print(f"低於 {THRESHOLD} 字的章節: {len(low_chapters)}")
    
    # 2. Show Shortest Chapters
    print("\n--- 字數最少的 10 章 ---")
    print(f"{'字數':<8} | {'章節名稱'}")
    print("-" * 40)
    for r in all_results[:10]:
        print(f"{r['count']:<8} | {r['path']}")
    
    # 3. Export CSV
    export_to_csv(all_results)
    print("="*50)

if __name__ == "__main__":
    main()
