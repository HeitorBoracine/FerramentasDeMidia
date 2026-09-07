import { useDragDrop } from "../hooks/useDragDrop";
import type { FileInfo } from "../types";

interface Props {
  file: FileInfo | null;
  disabled: boolean;
  onFilesSelected: (paths: string[]) => void;
  onClick: () => void;
}

export function DropZone({ file, disabled, onFilesSelected, onClick }: Props) {
  const { dragOver, zoneRef } = useDragDrop<HTMLDivElement>((paths) => {
    if (!disabled) onFilesSelected(paths);
  });

  const icon = dragOver ? "📥" : file ? (file.kind === "imagem" ? "🖼" : "🎥") : "⬇";
  const label = dragOver
    ? "Solte o arquivo aqui!"
    : file
      ? `✅  ${file.name}`
      : "Solte o vídeo ou imagem aqui  ou  clique para selecionar";

  // Encolhe pra uma barra compacta assim que um arquivo é selecionado —
  // libera espaço vertical pras outras seções. Volta ao tamanho grande
  // enquanto algo está sendo arrastado por cima, pra deixar claro que dá
  // pra soltar ali (inclusive pra trocar de arquivo).
  const compact = !dragOver && !!file;

  return (
    <div
      ref={zoneRef}
      className={`drop-zone${dragOver ? " drag-over" : ""}${compact ? " has-file" : ""}`}
      onClick={disabled ? undefined : onClick}
      style={disabled ? { cursor: "default" } : undefined}
    >
      <span className="drop-icon">{icon}</span>
      <span className={`drop-label${file ? " selected" : ""}`}>{label}</span>
      {!dragOver && !file && (
        <span className="drop-sub">
          Vídeos e imagens — MP4 MKV AVI MOV PNG JPG e outros formatos
          <br />
          Solte ou selecione vários arquivos do mesmo tipo pra processar em lote
        </span>
      )}
    </div>
  );
}
