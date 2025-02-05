// Optional: Check file size (e.g., max 5MB)
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const validateImageFile = (file: File): void => {
  const allowedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/jpg"];

  // Check file type
  if (!allowedImageTypes.includes(file.type)) {
    throw new Error("Invalid file type. Please upload a valid image file.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File size exceeds the maximum limit of 5MB.");
  }
};

export const getImageUrlFromS3 = async (fileName: string) => {
  try {
    const url = await fetch(`/api/image?fileName=${fileName}`, {
      method: "GET",
    });
    //@ts-ignore
    const { image } = await url.json();
    return image;
  } catch (error) {
    console.log({ error });
    throw new Error("Failed to get image");
  }
};
