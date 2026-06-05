import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface GeneralSettingsFormProps {
  name: string;
  description: string;
  configError: string | null;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}

export default function GeneralSettingsForm({
  name,
  description,
  configError,
  onNameChange,
  onDescriptionChange,
}: GeneralSettingsFormProps) {
  return (
    <section>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-t-ink-mid">Name</label>
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Space name"
            className="font-sans"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-t-ink-mid">
            Description
          </label>
          <Textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Describe this space..."
            rows={3}
            className="resize-y font-sans"
          />
        </div>
        {configError && <div className="text-[13px] text-t-accent">{configError}</div>}
      </div>
    </section>
  );
}
