import os
import re
import sys

# 定義要檢查的目錄
CHAPTERS_DIR = "/Users/george/Library/CloudStorage/OneDrive-MSFT/0.專案/novel/novel_Ratforge/章稿"

# 定義突破第四面牆的正規表達式 (針對正文中的第X卷、第X章、ChXX等)
# 排除掉開頭的章節標題
FORBIDDEN_PATTERNS = [
    r"(?<!# )第[一二三四五六七八九十0-9]+[卷章]",
    r"(?<!\w)Ch ?[0-9]+",  # Catch Ch 104, Ch104
    r"Chapter ?[0-9]+",    # Catch Chapter 104, Chapter104
    r"卷末",
    r"本章",
    r"下一章"
]

combined_pattern = re.compile("|".join(FORBIDDEN_PATTERNS), re.IGNORECASE)

def find_issues():
    issues = []
    for root, dirs, files in os.walk(CHAPTERS_DIR):
        for file in files:
            if file.endswith(".md"):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    
                # 略過前兩行 (通常是標題或空行)
                for i in range(2, len(lines)):
                    line = lines[i]
                    # 略過 Markdown 引用 (通常是系統提示框)
                    if line.strip().startswith(">"):
                        continue
                        
                    matches = combined_pattern.findall(line)
                    if matches:
                        issues.append({
                            "file": path,
                            "line_number": i + 1,
                            "content": line.strip(),
                            "matches": list(set(matches))
                        })
    return issues

if __name__ == "__main__":
    found_issues = find_issues()
    if not found_issues:
        print("SUCCESS: 未發現突破第四面牆的用語。")
    else:
        print(f"FOUND: 發現 {len(found_issues)} 處需要改善的部分：")
        print("-" * 20)
        for issue in found_issues:
            print(f"文件: {issue['file']}")
            print(f"行號: {issue['line_number']}")
            print(f"內容: {issue['content']}")
            print(f"關鍵字: {', '.join(issue['matches'])}")
            print("-" * 20)
