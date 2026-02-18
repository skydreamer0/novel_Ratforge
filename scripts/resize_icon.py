from PIL import Image
import os

def resize_icons():
    source_path = "icon-512.png"
    
    if not os.path.exists(source_path):
        print(f"{source_path} not found. Generating placeholder...")
        try:
            from PIL import ImageDraw, ImageFont
            # Create a dark grey placeholder
            img = Image.new('RGB', (512, 512), color=(40, 44, 52))
            draw = ImageDraw.Draw(img)
            
            # Draw a simple R or text if possible, or just a circle
            # Draw a central circle to represent the 'soul'
            w, h = 512, 512
            draw.ellipse((w//4, h//4, 3*w//4, 3*h//4), fill=(100, 200, 255), outline=(200, 200, 200))
            
            img.save(source_path)
            print(f"Created placeholder {source_path}")
        except Exception as e:
            print(f"Failed to generate placeholder: {e}")
            return

    try:
        img = Image.open(source_path)
        
        # Save 192x192
        img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
        img_192.save("icon-192.png")
        print("Created icon-192.png")
        
        # Save favicon (64x64)
        img_favicon = img.resize((64, 64), Image.Resampling.LANCZOS)
        img_favicon.save("favicon.png")
        print("Created favicon.png")
        
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    # Determine project root. If running from root, we are good.
    # If running from scripts/, move up one level.
    if os.path.basename(os.getcwd()) == 'scripts':
        os.chdir('..')
    
    resize_icons()
