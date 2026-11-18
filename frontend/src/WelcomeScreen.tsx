import {useState, useEffect, type SetStateAction, type Dispatch, type ReactNode} from "react";
import { useNavigate } from "react-router-dom";

interface PasswordInputComponentProps {
    selectedUsername: string;
    onLogin: (username: string, password: string) => void;
    onBack: (username: string | null) => void;
    password: string;
    onSetPassword: Dispatch<SetStateAction<string>>;
}

interface UserSelectionComponentProps {
    usernames: string[];
    onLogin: (username: string, password?: string) => void;
}

interface NewUserComponentProps {
    onLogin: (username: string, password: string) => void;
}

interface AddProfileWrapperComponentProps {
    children: ReactNode;
    isAddingProfile: boolean;
    setIsAddingProfile: Dispatch<SetStateAction<boolean>>;
}

function PasswordInputComponent({ selectedUsername, onLogin, onBack, password, onSetPassword }: PasswordInputComponentProps) {
    return <>
        <h2>Password for {selectedUsername}</h2>
        <input
            type="password"
            value={password}
            onChange={e => onSetPassword(e.target.value)}
        />
        <button onClick={() => onLogin(selectedUsername, password)}>Login</button>
        <button onClick={() => onBack(null)}>Back</button>
    </>
}

function UserSelectionComponent({ onLogin, usernames }: UserSelectionComponentProps) {
    return <>
        <h2>User Selection</h2>
        { usernames.length > 0 ? (
            <div className="user-grid">
                {usernames.map(username => (
                    <button
                        key={username}
                        onClick={() => onLogin(username)}
                    >
                        {username}
                    </button>
                ))}
            </div>
        ) : (
            <p style={{ fontStyle: 'italic' }}>There are currently no active users</p>
        )}
    </>
}

function NewUserComponent({ onLogin }: NewUserComponentProps) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const handleSubmit = (e: React.SubmitEvent) => {
        e.preventDefault();
        onLogin(username, password);
    }

    return (
        <>
            <h2>New User</h2>
            <form onSubmit={handleSubmit}>
                <input
                    value={username}
                    placeholder="Username"
                    onChange={e => setUsername(e.target.value)}
                />
                <input
                    value={password}
                    placeholder="Password"
                    onChange={e => setPassword(e.target.value)}
                />
                <button type="submit">Login</button>
            </form>
        </>
    )
}

function AddProfileWrapper({ children, isAddingProfile, setIsAddingProfile }: AddProfileWrapperComponentProps) {
    return (
        <>
            <button onClick={() => setIsAddingProfile(!isAddingProfile)}>Add Profile</button>
            { isAddingProfile ? ( children ) : null }
        </>
    )
}

export default function WelcomeScreen() {
    const [usernames, setUsernames] = useState<string[]>([]);
    const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
    const [password, setPassword] = useState("");
    const [isAddingProfile, setIsAddingProfile] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        fetch('/api/list-users')
            .then(res => res.json())
            .then(data => setUsernames(data.users))
            .catch(console.error);
    }, []);

    const handleLogin = async (username: string, typedPassword?: string)=> {
        const response = await fetch('/api/login', {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: typedPassword }),
        });

        if (response.ok) {
            navigate("/calendar");
        } else {
            setSelectedUsername(username);
        }
    };

    return (
        <div className="welcome-screen">
            <h1>Welcome</h1>
            <AddProfileWrapper
                isAddingProfile={isAddingProfile}
                setIsAddingProfile={setIsAddingProfile}
            >
                <NewUserComponent onLogin={handleLogin} />
            </AddProfileWrapper>
            { selectedUsername ? (
                <PasswordInputComponent
                    selectedUsername={selectedUsername}
                    onLogin={handleLogin}
                    onBack={setSelectedUsername}
                    password={password}
                    onSetPassword={setPassword} />
            ) : (
                <UserSelectionComponent usernames={usernames} onLogin={handleLogin} />
            )}
        </div>
    )
}