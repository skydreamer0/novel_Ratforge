import os
import glob

def count_words(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            count = len(''.join(content.split()))
            return count
    except Exception as e:
        return -1

directory = r"d:\專案\novel_Ratforge\章稿\第9卷_墜落地"
files = glob.glob(os.path.join(directory, "*.md"))

results = []
for file in files:
    count = count_words(file)
    if count < 3000:
        results.append((os.path.basename(file), count))

results.sort(key=lambda x: x[1])

print(f"{'Filename':<30} | {'Count':<10}")
print("-" * 45)
for name, count in results:
    print(f"{name:<30} | {count:<10}")
