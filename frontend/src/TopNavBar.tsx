import './TopNavBar.css'


export interface TopNavBarProps {
    userName: string;
    onSwitchProfile: () => void;
}

export default function TopNavBar({ userName, onSwitchProfile }: TopNavBarProps ) {
    return (
        <div className="top-bar">
            <span>
                {userName}
            </span>
            <button onClick={onSwitchProfile}>
                Switch Profile
            </button>
        </div>
    )
}