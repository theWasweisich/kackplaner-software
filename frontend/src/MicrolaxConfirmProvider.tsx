import {createContext, useContext, useState, useCallback, type ReactNode, useRef, useEffect} from 'react';
import './MicrolaxConfirmProvider.css';

interface ConfirmOptions {
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
}

interface DialogState extends ConfirmOptions {
    isOpen: boolean;
    resolve: ((value: boolean) => void) | null;
}

type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction | null>(null);

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
    const [dialogConfig, setDialogConfig] = useState<DialogState>({
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        resolve: null
    });

    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (dialogConfig.isOpen && !dialog.open) {
            dialog.showModal();
        } else if (!dialogConfig.isOpen && dialog.open) {
            dialog.close();
        }
    }, [dialogConfig.isOpen]);

    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setDialogConfig({
                isOpen: true,
                title: options.title || 'Confirm',
                message: options.message || 'Sicher?',
                confirmText: options.confirmText || 'Ja',
                cancelText: options.cancelText || 'Nein',
                resolve
            });
        });
    }, []);

    const handleAction = (result: boolean) => {
        if (dialogConfig.resolve) {
            dialogConfig.resolve(result);
        }
        setDialogConfig((prevState) => ({ ...prevState, isOpen: false, resolve: null }));
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const rect = dialog.getBoundingClientRect();
        const isClickOuside =
            e.clientX > rect.right ||
            e.clientX < rect.left ||
            e.clientY > rect.bottom ||
            e.clientY < rect.top

        if (isClickOuside) {
            handleAction(false);
        }
    }

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}

            <dialog
                className="microlax-dialog"
                ref={dialogRef}
                onClick={handleBackdropClick}
                onCancel={(e) => {
                    e.preventDefault();
                    handleAction(false);
                }}
                >
                <h3 style={{ marginTop: 0 }}>{dialogConfig.title}</h3>
                <p>{dialogConfig.message}</p>
                <div>
                    <button className="cancel-button" onClick={() => handleAction(false)}>
                        {dialogConfig.cancelText}
                    </button>
                    <button className="confirm-button" onClick={() => handleAction(true)}>
                        {dialogConfig.confirmText}
                    </button>
                </div>
            </dialog>
        </ConfirmContext.Provider>
    )
};

export const useConfirm = (): ConfirmFunction => {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within ConfirmProvider');
    }
    return context;
}