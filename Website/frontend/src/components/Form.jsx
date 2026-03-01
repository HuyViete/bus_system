import React from 'react'

const LoginForm = () => {
    return (
        <form className='flex flex-col gap-5 bg-white p-8 w-full max-w-md rounded-2xl shadow-xl border border-gray-100 mx-4'>
            <div className='flex flex-col items-center mb-4'>
                <h1 className='text-3xl font-bold text-gray-800 mb-1'>Welcome Back</h1>
                <p className='text-gray-500 text-sm'>Please enter your details to sign in</p>
            </div>

            <div className='flex flex-col gap-4'>
                <div className='flex flex-col gap-1.5'>
                    <label className='text-sm font-semibold text-gray-700' htmlFor="username">Username</label>
                    <input
                        id="username"
                        type="text"
                        placeholder="Enter your username"
                        className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors w-full bg-gray-50 text-gray-900"
                    />
                </div>

                <div className='flex flex-col gap-1.5'>
                    <label className='text-sm font-semibold text-gray-700' htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors w-full bg-gray-50 text-gray-900"
                    />
                </div>
            </div>

            <button
                className='w-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors mt-4 shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2'
                type="submit">
                Sign in
            </button>
        </form>
    )
}

export default LoginForm