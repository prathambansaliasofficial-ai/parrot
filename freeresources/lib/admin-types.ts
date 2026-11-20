export type FieldOption = { value: string; label: string };

export type AdminField = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "select" | "checkbox" | "url" | "email" | "date";
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: FieldOption[];
  optionsFrom?: "universities" | "programmes" | "branches" | "categories" | "colleges";
  min?: number;
  max?: number;
  full?: boolean;
};
